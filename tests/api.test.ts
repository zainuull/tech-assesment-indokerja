import 'dotenv/config';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { resolve } from 'node:path';
import { test } from 'node:test';
import type { Application, Job, Session } from '../shared/domain';
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
  await db.user.createMany({ data: [
    { name: 'Ruang Digital', email: 'company@example.com', role: 'COMPANY', passwordHash },
    { name: 'Sagara Studio', email: 'other-company@example.com', role: 'COMPANY', passwordHash },
    { name: 'Raka Pratama', email: 'seeker@example.com', role: 'JOB_SEEKER', passwordHash },
  ] });
  execFileSync(process.execPath, [resolve('node_modules/tsx/dist/cli.mjs'), 'prisma/create-account.ts'], {
    env: {
      ...process.env, DATABASE_URL: url.toString(), ACCOUNT_NAME: 'Alya Putri',
      ACCOUNT_EMAIL: 'other-seeker@example.com', ACCOUNT_ROLE: 'JOB_SEEKER', ACCOUNT_PASSWORD: password,
    },
  });
  const server = createApp(db, randomBytes(32).toString('hex')).listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise<void>((done, reject) => server.close(error => error ? reject(error) : done())));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
  async function request<T = { error: { code: string; fields?: Record<string, string> } }>(
    path: string, status: number | null, options: { method?: string; token?: string; body?: unknown } = {},
  ) {
    const { method, token, body } = options;
    const response = await fetch(base + path, {
      method,
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      body: JSON.stringify(body),
    });
    const data = await response.json() as T;
    if (status !== null) assert.equal(response.status, status, `${method ?? 'GET'} ${path}: ${JSON.stringify(data)}`);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    return { status: response.status, data };
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
});
