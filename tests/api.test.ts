import 'dotenv/config';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomBytes, scryptSync } from 'node:crypto';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { test } from 'node:test';
import type { Application, Candidate, CandidateDetail, CandidateNote, Job, OwnedJob, Session } from '../shared/domain';
import { createApp } from '../server/app';
import { createDb } from '../server/db';
import { hashPassword } from '../server/password';

test('REST workflow and database invariants', { timeout: 30_000 }, async t => {
  assert.ok(process.env.DATABASE_URL, 'Set DATABASE_URL to a local PostgreSQL instance.');
  const url = new URL(process.env.DATABASE_URL);
  const schema = `test_${randomBytes(8).toString('hex')}`;
  url.searchParams.set('schema', schema);
  const db = createDb(url.toString());
  t.after(async () => {
    try {
      await db.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    } finally {
      await db.$disconnect();
    }
  });
  execFileSync(process.execPath, [resolve('node_modules/prisma/build/index.js'), 'migrate', 'deploy'], {
    env: { ...process.env, DATABASE_URL: url.toString() },
  });

  const password = 'Test password 123!';
  const passwordHash = await hashPassword(password);
  const salt = randomBytes(16).toString('hex');
  const legacyHash = `${salt}:${scryptSync(password, salt, 64).toString('hex')}`;
  await db.user.createMany({ data: [
    { name: 'Ruang Digital', email: 'company@example.com', role: 'COMPANY', passwordHash: legacyHash },
    { name: 'Sagara Studio', email: 'other-company@example.com', role: 'COMPANY', passwordHash },
    { name: 'Raka Pratama', email: 'seeker@example.com', role: 'JOB_SEEKER', passwordHash },
  ] });
  execFileSync(process.execPath, [resolve('node_modules/tsx/dist/cli.mjs'), 'prisma/create-account.ts'], {
    env: {
      ...process.env, DATABASE_URL: url.toString(), ACCOUNT_NAME: 'Alya Putri',
      ACCOUNT_EMAIL: 'other-seeker@example.com', ACCOUNT_ROLE: 'JOB_SEEKER', ACCOUNT_PASSWORD: password,
    },
  });
  const secret = randomBytes(32).toString('hex');
  const server = createApp(db, secret).listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise<void>((done, reject) => server.close(error => error ? reject(error) : done())));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
  async function request<T = { error: { code: string; fields?: Record<string, string> } }>(
    path: string, status: number | null, options: { method?: string; token?: string; body?: unknown; headers?: Record<string, string> } = {},
  ) {
    const { method, token, body } = options;
    const response = await fetch(base + path, {
      method,
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...options.headers,
      },
      body: JSON.stringify(body),
    });
    const data = (response.status === 204 ? undefined : await response.json()) as T;
    if (status !== null) assert.equal(response.status, status, `${method ?? 'GET'} ${path}: ${JSON.stringify(data)}`);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.match(response.headers.get('x-request-id') ?? '', /^[0-9a-f-]{36}$/i);
    return { status: response.status, data, headers: response.headers };
  }
  const login = async (email: string) => (await request<Session>('/auth/login', 200, { method: 'POST', body: { email, password } })).data;
  const post = 'POST';
  const patch = 'PATCH';

  await t.test('authentication and input validation', async () => {
    await request('/health', 200);
    await request('/auth/login', 401, { method: post, body: { email: 'seeker@example.com', password: 'incorrect-password' } });
    await request('/auth/login', 400, { method: post, body: { email: 'invalid', password } });
    await request('/auth/me', 401, { token: 'invalid-token' });
    await request('/applications/me', 401);
    await request('/missing', 404);
    await request('/jobs/invalid', 400);
    await request('/jobs?jobType=INVALID', 400);
    await request('/jobs?page=0', 400);
    await request('/jobs?limit=51', 400);
    await request('/jobs?q=%00', 400);
    await request('/auth/login', 415, { method: post, body: { email: 'seeker@example.com', password }, headers: { 'Content-Type': 'text/plain' } });
    assert.equal((await fetch(base + '/auth/login', {
      method: post, headers: { 'Content-Type': 'application/json' }, body: '{',
    })).status, 400);
  });

  const [company, otherCompany, seeker, otherSeeker] = await Promise.all(
    ['COMPANY@example.com', 'other-company@example.com', 'seeker@example.com', 'other-seeker@example.com'].map(login),
  );
  assert.equal(company.user.role, 'COMPANY');
  assert.equal(seeker.user.role, 'JOB_SEEKER');
  assert.equal('passwordHash' in seeker.user, false);
  const upgraded = await db.user.findUniqueOrThrow({ where: { id: company.user.id }, select: { passwordHash: true } });
  assert.match(upgraded.passwordHash, /^scrypt-v2:/);

  const input = { title: 'Frontend Developer', description: 'Build accessible web products.', location: 'Jakarta', jobType: 'FULL_TIME', salaryMin: 10, salaryMax: 20 };
  const badSalary = await request('/jobs', 400, { method: post, token: company.token, body: { ...input, salaryMax: 0 } });
  assert.ok(badSalary.data.error.fields?.salaryMax);
  await request('/jobs', 403, { method: post, token: seeker.token, body: input });
  const { data: job } = await request<Job>('/jobs', 201, { method: post, token: company.token, body: { ...input, companyId: otherCompany.user.id } });
  assert.equal(job.company.id, company.user.id);
  const jobPath = `/jobs/${job.id}`;
  const candidatesPath = `${jobPath}/applications`;
  const { data: detail } = await request<Job>(jobPath, 200);
  assert.equal(detail.description, input.description);
  const { data: filtered } = await request<Job[]>('/jobs?q=ruang&location=jakarta&jobType=FULL_TIME', 200);
  assert.deepEqual(filtered.map(item => item.id), [job.id]);
  const { data: wildcard } = await request<Job[]>('/jobs?q=%25', 200);
  assert.deepEqual(wildcard, []);
  const { data: mine } = await request<Job[]>('/jobs/mine', 200, { token: otherCompany.token });
  assert.deepEqual(mine, []);
  await request(candidatesPath, 403, { method: post, token: company.token });
  await request(candidatesPath, 403, { token: seeker.token });
  await request(candidatesPath, 404, { token: otherCompany.token });
  await request('/applications/me', 403, { token: company.token });

  const applicationStatePath = `${jobPath}/application`;
  assert.deepEqual((await request(applicationStatePath, 200, { token: seeker.token })).data, { state: 'OPEN', applied: false });
  await request(applicationStatePath, 403, { token: company.token });
  const submission = { method: post, token: seeker.token, body: { seekerId: otherSeeker.user.id } };
  const [first, second] = await Promise.all([
    request<Application>(candidatesPath, null, submission), request<Application>(candidatesPath, null, submission),
  ]);
  assert.deepEqual([first.status, second.status].sort(), [201, 409]);
  const application = first.status === 201 ? first.data : second.data;
  assert.equal(application.status, 'APPLIED');
  assert.deepEqual(application.history.map(entry => [entry.fromStatus, entry.toStatus]), [[null, 'APPLIED']]);
  const duplicate = await request(candidatesPath, 409, submission);
  assert.equal(duplicate.data.error.code, 'ALREADY_APPLIED');
  assert.deepEqual((await request(applicationStatePath, 200, { token: seeker.token })).data, { state: 'OPEN', applied: true });
  assert.deepEqual((await request(applicationStatePath, 200, { token: otherSeeker.token })).data, { state: 'OPEN', applied: false });

  const { data: candidates } = await request<Job & { applications: { seeker: { email: string } }[] }>(candidatesPath, 200, { token: company.token });
  assert.equal(candidates.applications.length, 1);
  assert.deepEqual(candidates.applications[0].seeker, { name: 'Raka Pratama', email: 'seeker@example.com' });
  const statusPath = `/applications/${application.id}/status`;
  await request(statusPath, 403, { method: patch, token: seeker.token, body: { status: 'REVIEWING' } });
  await request(statusPath, 404, { method: patch, token: otherCompany.token, body: { status: 'REVIEWING' } });
  const invalid = await request(statusPath, 400, { method: patch, token: company.token, body: { status: 'INVALID' } });
  assert.equal(invalid.data.error.code, 'INVALID_STATUS');
  const update = (status: string) => request<Application>(statusPath, 200, {
    method: patch, token: company.token, body: { status },
  });
  assert.equal((await update('APPLIED')).data.history.length, 1);
  await Promise.all([update('REVIEWING'), update('SHORTLISTED')]);
  await update('ACCEPTED');
  const { data: applications } = await request<Application[]>('/applications/me', 200, { token: seeker.token });
  assert.equal(applications.length, 1);
  const [current] = applications;
  assert.equal(current.status, 'ACCEPTED');
  assert.equal(current.history.length, 4);
  assert.deepEqual(new Set(current.history.map(entry => entry.toStatus)), new Set(['APPLIED', 'REVIEWING', 'SHORTLISTED', 'ACCEPTED']));
  assert.deepEqual(current.history.slice(1).map(entry => entry.fromStatus), current.history.slice(0, -1).map(entry => entry.toStatus));
  assert.equal((await update('ACCEPTED')).data.history.length, 4);
  assert.deepEqual((await request<Application[]>('/applications/me', 200, { token: otherSeeker.token })).data, []);

  await t.test('candidate pipeline and private notes', async () => {
    const { data: owned } = await request<OwnedJob[]>('/jobs/mine', 200, { token: company.token });
    assert.deepEqual(owned[0].stageCounts, { ACCEPTED: 1 });
    assert.equal(owned[0]._count.applications, 1);
    const { data: pipeline } = await request<Candidate[]>('/applications/company', 200, { token: company.token });
    assert.deepEqual(pipeline.map(candidate => [candidate.id, candidate.job.id, candidate.status]), [[application.id, job.id, 'ACCEPTED']]);
    assert.deepEqual((await request<Candidate[]>('/applications/company', 200, { token: otherCompany.token })).data, []);
    await request('/applications/company', 403, { token: seeker.token });

    const profile = `/applications/${application.id}`;
    const notes = `${profile}/notes`;
    await request(profile, 404, { token: otherCompany.token });
    await request(profile, 403, { token: seeker.token });
    await request(notes, 404, { method: post, token: otherCompany.token, body: { body: 'Tidak berwenang' } });
    await request(notes, 403, { method: post, token: seeker.token, body: { body: 'Tidak berwenang' } });
    await request(notes, 400, { method: post, token: company.token, body: { body: '   ' } });
    const internal = 'Catatan penilaian internal yang tidak boleh dibaca pelamar.';
    const { data: note } = await request<CandidateNote>(notes, 201, { method: post, token: company.token, body: { body: `  ${internal}  ` } });
    const { data: candidate } = await request<CandidateDetail>(profile, 200, { token: company.token });
    assert.equal(note.body, internal);
    assert.deepEqual(candidate.notes, [note]);
    assert.deepEqual(candidate.history, current.history);
    const { data: applicantView } = await request<Application[]>('/applications/me', 200, { token: seeker.token });
    assert.equal(JSON.stringify(applicantView).includes(internal), false);
    assert.equal('notes' in applicantView[0], false);
  });

  await t.test('job lifecycle and preserved application history', async () => {
    assert.equal(job.state, 'OPEN');
    const { data: draft } = await request<Job>('/jobs', 201, { method: post, token: company.token, body: { ...input, title: 'Draf QA', state: 'DRAFT' } });
    const draftPath = `/jobs/${draft.id}`;
    const draftState = `${draftPath}/state`;
    const draftApply = `${draftPath}/applications`;
    const changeState = (path: string, state: 'OPEN' | 'CLOSED') =>
      request<Job>(path, 200, { method: patch, token: company.token, body: { state } });

    assert.equal(draft.state, 'DRAFT');
    await request(draftPath, 404);
    await request(draftApply, 404, { method: post, token: seeker.token });
    await request(`${draftPath}/manage`, 404, { token: otherCompany.token });
    await request(`${draftPath}/manage`, 403, { token: seeker.token });
    assert.equal((await request<Job>(`${draftPath}/manage`, 200, { token: company.token })).data.state, 'DRAFT');
    assert.deepEqual((await request<Job[]>('/jobs?q=Draf', 200)).data, []);
    await request(draftPath, 404, { method: patch, token: otherCompany.token, body: input });
    await request(draftPath, 403, { method: patch, token: seeker.token, body: input });
    await request(draftState, 404, { method: patch, token: otherCompany.token, body: { state: 'OPEN' } });
    await request(draftState, 409, { method: patch, token: company.token, body: { state: 'CLOSED' } });
    const { data: edited } = await request<Job>(draftPath, 200, {
      method: patch, token: company.token, body: { ...input, title: 'QA Engineer', state: 'OPEN' },
    });
    assert.equal(edited.state, 'DRAFT');
    assert.equal(edited.title, 'QA Engineer');
    assert.equal((await changeState(draftState, 'OPEN')).data.state, 'OPEN');
    assert.equal((await request<Job>(draftPath, 200)).data.title, 'QA Engineer');

    assert.equal((await changeState(`${jobPath}/state`, 'CLOSED')).data.state, 'CLOSED');
    const { data: closed } = await request(candidatesPath, 409, { method: post, token: otherSeeker.token });
    assert.equal(closed.error.code, 'JOB_CLOSED');
    assert.equal((await request<Job>(jobPath, 200)).data.state, 'CLOSED');
    assert.equal((await request<Job[]>('/jobs', 200)).data.some(item => item.id === job.id), false);
    const { data: kept } = await request<(Application & { job: Job })[]>('/applications/me', 200, { token: seeker.token });
    assert.equal(kept[0].job.state, 'CLOSED');
    assert.deepEqual(kept[0].history, current.history);
    await request(candidatesPath, 200, { token: company.token });
    await assert.rejects(
      db.application.create({ data: { jobId: job.id, seekerId: otherSeeker.user.id } }),
      { code: 'P2039', message: /Application requires an open job/ },
    );
    assert.equal((await changeState(`${jobPath}/state`, 'OPEN')).data.state, 'OPEN');
    await request(candidatesPath, 201, { method: post, token: otherSeeker.token });
  });

  await t.test('bounded pagination keeps filters and order', async () => {
    const first = await request<Job[]>('/jobs?location=Jakarta&limit=1', 200);
    assert.equal(first.data.length, 1);
    const next = first.headers.get('link')?.match(/<([^>]+)>; rel="next"/)?.[1];
    assert.equal(next, '/api/jobs?page=2&limit=1&location=Jakarta');
    const second = await request<Job[]>(next!.slice('/api'.length), 200);
    assert.equal(second.data.length, 1);
    assert.notEqual(second.data[0].id, first.data[0].id);
    assert.match(second.headers.get('link') ?? '', /rel="prev"/);
    assert.doesNotMatch(second.headers.get('link') ?? '', /rel="next"/);
  });

  await t.test('browser sessions are private, guarded, and revocable', async () => {
    const loginBody = { email: 'company@example.com', password };
    const browser = { 'X-IndoKerja-Request': '1' };
    await request('/auth/session', 403, { method: post, body: loginBody });
    await request('/auth/session', 403, { method: post, body: loginBody, headers: { ...browser, 'Sec-Fetch-Site': 'cross-site' } });
    const { data: browserUser, headers } = await request('/auth/session', 200, { method: post, body: loginBody, headers: browser });
    assert.deepEqual(browserUser, company.user);
    const issued = headers.get('set-cookie') ?? '';
    assert.match(issued, /^indokerja_session=[\w-]{43};/);
    assert.match(issued, /HttpOnly/);
    assert.match(issued, /SameSite=Strict/);
    const cookie = issued.split(';')[0];
    const token = cookie.split('=')[1];
    assert.equal(await db.authSession.count({ where: { tokenHash: token } }), 0);
    await request('/auth/me', 200, { headers: { Cookie: cookie } });
    await request('/jobs', 403, { method: post, body: input, headers: { Cookie: cookie } });
    await request('/jobs', 401, { method: post, body: input, headers: { Cookie: cookie, ...browser, 'X-IndoKerja-User': otherCompany.user.id } });
    await request('/auth/logout', 403, { method: post, headers: { Cookie: cookie } });
    await request('/auth/logout', 401, { method: post, headers: { Cookie: cookie, ...browser, 'X-IndoKerja-User': otherCompany.user.id } });
    await request('/auth/me', 200, { headers: { Cookie: cookie } });
    const logout = await request('/auth/logout', 204, { method: post, headers: { Cookie: cookie, ...browser } });
    assert.match(logout.headers.get('set-cookie') ?? '', /^indokerja_session=;/);
    await request('/auth/me', 401, { headers: { Cookie: cookie } });
    await request('/auth/logout', 204, { method: post, token: seeker.token });
    await request('/auth/me', 401, { token: seeker.token });
    await db.authSession.updateMany({ where: { userId: otherCompany.user.id }, data: { expiresAt: new Date(0) } });
    await request('/auth/me', 401, { token: otherCompany.token });

    const secure = createApp(db, secret, false, true).listen(0, '127.0.0.1');
    await once(secure, 'listening');
    t.after(() => new Promise<void>(done => secure.close(() => done())));
    const response = await fetch(`http://127.0.0.1:${(secure.address() as AddressInfo).port}/api/auth/session`, {
      method: post, headers: { ...browser, 'Content-Type': 'application/json' }, body: JSON.stringify(loginBody),
    });
    assert.equal(response.status, 200);
    assert.match(response.headers.get('set-cookie') ?? '', /^__Host-indokerja_session=.*; Secure/);
    await response.json();
  });

  await t.test('database serializes an application against a closing job', async () => {
    const applicant = await db.user.create({
      data: { name: 'Pelamar serentak', email: 'race@example.com', role: 'JOB_SEEKER', passwordHash },
    });
    let markLocked!: () => void;
    let release!: () => void;
    const locked = new Promise<void>(resolve => { markLocked = resolve; });
    const gate = new Promise<void>(resolve => { release = resolve; });
    const closing = db.$transaction(async tx => {
      await tx.job.update({ where: { id: job.id }, data: { state: 'CLOSED' } });
      markLocked();
      await gate;
    }, { timeout: 8_000 });
    await Promise.race([locked, closing]);
    const submitted = db.application.create({ data: { jobId: job.id, seekerId: applicant.id } }).then(
      () => undefined,
      error => error,
    );
    let blocked = false;
    try {
      for (let attempt = 0; attempt < 40 && !blocked; attempt++) {
        const [result] = await db.$queryRaw<{ blocked: boolean }[]>`
          SELECT EXISTS (
            SELECT 1 FROM pg_stat_activity
            WHERE pid <> pg_backend_pid() AND wait_event_type = 'Lock'
              AND strpos(query, ${`"${schema}"."Application"`}) > 0
          ) AS blocked
        `;
        blocked = result.blocked;
        if (!blocked) await delay(50);
      }
    } finally {
      release();
      await closing;
    }
    assert.equal(blocked, true);
    const error = await submitted;
    assert.equal(error?.code, 'P2039');
    assert.equal(error.meta?.driverAdapterError?.cause?.originalCode, '23514');
    assert.equal(error.meta?.driverAdapterError?.cause?.originalMessage, 'Application requires an open job.');
    assert.equal(await db.application.count({ where: { jobId: job.id, seekerId: applicant.id } }), 0);
  });
});
