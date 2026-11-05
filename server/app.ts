import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { ApplicationStatus, JobState, Prisma, PrismaClient, Role } from '../generated/prisma/client';
import express, { type ErrorRequestHandler } from 'express';
import helmet from 'helmet';
import { currentUser, registerAuth } from './auth';
import { ApiError, createJobSchema, idSchema, jobSchema, jobStateSchema, noteSchema, requireJson, searchSchema, statusSchema, validate, validateJson } from './validation';

const company = { select: { id: true, name: true } } as const;
const history = {
  select: { id: true, fromStatus: true, toStatus: true, changedAt: true },
  orderBy: { id: 'asc' },
} as const;

const candidate = {
  id: true, status: true, appliedAt: true,
  seeker: { select: { name: true, email: true } },
  job: { select: { id: true, title: true } },
} as const;
const candidateOrder = [{ appliedAt: 'desc' }, { id: 'asc' }] satisfies Prisma.ApplicationOrderByWithRelationInput[];
const note = { id: true, body: true, createdAt: true } as const;

const jobMissing = () => new ApiError(404, 'JOB_NOT_FOUND', 'Lowongan tidak ditemukan.');
const applicationMissing = () => new ApiError(404, 'APPLICATION_NOT_FOUND', 'Lamaran tidak ditemukan.');
const prismaError = (error: unknown, code: string) =>
  error instanceof Prisma.PrismaClientKnownRequestError && error.code === code;

async function serializable<T>(db: PrismaClient, action: (tx: Prisma.TransactionClient) => Promise<T>, conflict: ApiError) {
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      return await db.$transaction(action, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if (!prismaError(error, 'P2034')) throw error;
    }
  }
  throw conflict;
}

const notFound = () => new ApiError(404, 'NOT_FOUND', 'Endpoint tidak ditemukan.');

export function createApp(db: PrismaClient, secret: string, trustProxy = false, secureCookies = trustProxy) {
  const app = express();
  app.disable('x-powered-by');
  if (trustProxy) app.set('trust proxy', 1);
  app.use(helmet({
    strictTransportSecurity: secureCookies ? undefined : false,
    contentSecurityPolicy: {
      directives: { upgradeInsecureRequests: secureCookies ? [] : null },
    },
  }));
  app.use('/api', (_req, res, next) => {
    res.set({ 'Cache-Control': 'no-store', 'X-Request-Id': randomUUID() });
    next();
  });
  app.use('/api', express.json({ limit: '32kb' }));

  const auth = registerAuth(app, db, secret, secureCookies);

  app.get('/api/health', async (_req, res) => {
    try {
      await db.$queryRaw`SELECT 1`;
    } catch {
      throw new ApiError(503, 'UNAVAILABLE', 'Database belum dapat dihubungi.');
    }
    res.json({ status: 'ok' });
  });

  app.get('/api/jobs', async (req, res) => {
    const { q, location, jobType, page = 1, limit = 12 } = validate(searchSchema, req.query);
    const contains = (value: string) => ({
      contains: value.replace(/[\\%_]/g, '\\$&'),
      mode: 'insensitive' as const,
    });
    const jobs = await db.job.findMany({
      where: {
        state: JobState.OPEN,
        jobType,
        location: location ? contains(location) : undefined,
        OR: q ? [{ title: contains(q) }, { company: { name: contains(q) } }] : undefined,
      },
      include: { company },
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      skip: (page - 1) * limit,
      take: limit + 1,
    });
    const link = (target: number) => {
      const params = new URLSearchParams({ page: String(target), limit: String(limit) });
      if (q) params.set('q', q);
      if (location) params.set('location', location);
      if (jobType) params.set('jobType', jobType);
      return `/api/jobs?${params}`;
    };
    if (page > 1) res.links({ prev: link(page - 1) });
    if (jobs.length > limit && page < 1000) res.links({ next: link(page + 1) });
    res.json(jobs.slice(0, limit));
  });

  app.get('/api/jobs/mine', auth(Role.COMPANY), async (_req, res) => {
    const companyId = currentUser(res).id;
    const groupedStages = db.application.groupBy({
      by: ['jobId', 'status'],
      where: { job: { companyId } },
      _count: { _all: true },
      orderBy: [{ jobId: 'asc' }, { status: 'asc' }],
    });
    const [jobs, stages] = await db.$transaction([
      db.job.findMany({
        where: { companyId },
        include: { company, _count: { select: { applications: true } } },
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      }),
      groupedStages,
    ], { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
    const counts = new Map<string, Partial<Record<ApplicationStatus, number>>>();
    for (const { jobId, status, _count } of stages) {
      const stagesForJob = counts.get(jobId) ?? {};
      stagesForJob[status] = _count._all;
      counts.set(jobId, stagesForJob);
    }
    res.json(jobs.map(job => ({ ...job, stageCounts: counts.get(job.id) ?? {} })));
  });

  app.get('/api/jobs/:jobId/manage', auth(Role.COMPANY), async (req, res) => {
    const id = validate(idSchema, req.params.jobId);
    const job = await db.job.findUnique({ where: { id, companyId: currentUser(res).id }, include: { company } });
    if (!job) throw jobMissing();
    res.json(job);
  });

  app.get('/api/jobs/:jobId', async (req, res) => {
    const id = validate(idSchema, req.params.jobId);
    const job = await db.job.findUnique({ where: { id, state: { not: JobState.DRAFT } }, include: { company } });
    if (!job) throw jobMissing();
    res.json(job);
  });

  app.post('/api/jobs', auth(Role.COMPANY), async (req, res) => {
    const data = validateJson(createJobSchema, req);
    const job = await db.job.create({
      data: { ...data, companyId: currentUser(res).id },
      include: { company },
    });
    res.status(201).json(job);
  });

  app.patch('/api/jobs/:jobId', auth(Role.COMPANY), async (req, res) => {
    const id = validate(idSchema, req.params.jobId);
    const data = validateJson(jobSchema, req);
    try {
      const job = await db.job.update({
        where: { id, companyId: currentUser(res).id },
        data, include: { company },
      });
      res.json(job);
    } catch (error) {
      if (prismaError(error, 'P2025')) throw jobMissing();
      throw error;
    }
  });

  app.patch('/api/jobs/:jobId/state', auth(Role.COMPANY), async (req, res) => {
    const id = validate(idSchema, req.params.jobId);
    const { state } = validateJson(jobStateSchema, req);
    const owner = { id, companyId: currentUser(res).id };
    try {
      const job = await db.job.update({
        where: { ...owner, state: state === JobState.CLOSED ? { not: JobState.DRAFT } : undefined },
        data: { state }, include: { company },
      });
      res.json(job);
    } catch (error) {
      if (!prismaError(error, 'P2025')) throw error;
      if (!await db.job.findUnique({ where: owner, select: { id: true } })) throw jobMissing();
      throw new ApiError(409, 'INVALID_JOB_TRANSITION', 'Publikasikan draf sebelum menutup lowongan.');
    }
  });

  app.get('/api/jobs/:jobId/application', auth(Role.JOB_SEEKER), async (req, res) => {
    const id = validate(idSchema, req.params.jobId);
    const job = await db.job.findUnique({
      where: { id, state: { not: JobState.DRAFT } },
      select: { state: true, _count: { select: { applications: { where: { seekerId: currentUser(res).id } } } } },
    });
    if (!job) throw jobMissing();
    res.json({ state: job.state, applied: job._count.applications > 0 });
  });

  app.post('/api/jobs/:jobId/applications', auth(Role.JOB_SEEKER), async (req, res) => {
    const jobId = validate(idSchema, req.params.jobId);
    const seekerId = currentUser(res).id;

    try {
      const application = await serializable(db, async tx => {
        const job = await tx.job.findUnique({ where: { id: jobId }, select: { state: true } });
        if (!job || job.state === JobState.DRAFT) throw jobMissing();
        if (job.state === JobState.CLOSED) throw new ApiError(409, 'JOB_CLOSED', 'Lowongan ini sudah ditutup.');

        return tx.application.create({
          data: {
            jobId, seekerId,
            history: { create: { toStatus: ApplicationStatus.APPLIED, changedBy: seekerId } },
          },
          include: { history },
        });
      }, new ApiError(409, 'APPLICATION_CONFLICT', 'Lowongan baru saja berubah. Muat ulang detail lalu coba lagi.'));
      res.status(201).json(application);
    } catch (error) {
      if (prismaError(error, 'P2002')) throw new ApiError(409, 'ALREADY_APPLIED', 'Kamu sudah melamar lowongan ini.');
      if (prismaError(error, 'P2004')) throw new ApiError(409, 'JOB_CLOSED', 'Lowongan ini sudah ditutup.');
      throw error;
    }
  });

  app.get('/api/applications/me', auth(Role.JOB_SEEKER), async (_req, res) => {
    const applications = await db.application.findMany({
      where: { seekerId: currentUser(res).id },
      include: { job: { include: { company } }, history },
      orderBy: [{ appliedAt: 'desc' }, { id: 'asc' }],
    });
    res.json(applications);
  });

  app.get('/api/jobs/:jobId/applications', auth(Role.COMPANY), async (req, res) => {
    const id = validate(idSchema, req.params.jobId);
    const job = await db.job.findUnique({
      where: { id, companyId: currentUser(res).id },
      include: {
        company,
        applications: {
          select: candidate,
          orderBy: candidateOrder,
        },
      },
    });
    if (!job) throw jobMissing();
    res.json(job);
  });

  app.get('/api/applications/company', auth(Role.COMPANY), async (_req, res) => {
    const applications = await db.application.findMany({
      where: { job: { companyId: currentUser(res).id } },
      select: candidate,
      orderBy: candidateOrder,
    });
    res.json(applications);
  });

  app.get('/api/applications/:applicationId', auth(Role.COMPANY), async (req, res) => {
    const id = validate(idSchema, req.params.applicationId);
    const application = await db.application.findUnique({
      where: { id, job: { companyId: currentUser(res).id } },
      select: { ...candidate, history, notes: { select: note, orderBy: { id: 'desc' } } },
    });
    if (!application) throw applicationMissing();
    res.json(application);
  });

  app.post('/api/applications/:applicationId/notes', auth(Role.COMPANY), async (req, res) => {
    const applicationId = validate(idSchema, req.params.applicationId);
    const { body } = validateJson(noteSchema, req);
    const application = await db.application.findUnique({
      where: { id: applicationId, job: { companyId: currentUser(res).id } },
      select: { id: true },
    });
    if (!application) throw applicationMissing();
    const created = await db.candidateNote.create({ data: { applicationId, body }, select: note });
    res.status(201).json(created);
  });

  app.patch('/api/applications/:applicationId/status', auth(Role.COMPANY), async (req, res) => {
    const id = validate(idSchema, req.params.applicationId);
    requireJson(req);
    const parsed = statusSchema.safeParse(req.body);
    if (!parsed.success) throw new ApiError(400, 'INVALID_STATUS', 'Pilih status lamaran yang tersedia.');
    const { status } = parsed.data;
    const companyId = currentUser(res).id;

    const application = await serializable(db, async tx => {
      const current = await tx.application.findUnique({
        where: { id, job: { companyId } },
        include: { history },
      });
      if (!current) throw applicationMissing();
      if (current.status === status) return current;

      return tx.application.update({
        where: { id },
        data: {
          status,
          history: { create: { fromStatus: current.status, toStatus: status, changedBy: companyId } },
        },
        include: { history },
      });
    }, new ApiError(409, 'STATUS_CONFLICT', 'Status baru saja berubah. Muat ulang kandidat lalu coba lagi.'));
    res.json(application);
  });

  app.use('/api', () => { throw notFound(); });
  const dist = resolve('dist');
  app.use(express.static(dist));
  app.get('/{*path}', (_req, res) => res.sendFile(resolve(dist, 'index.html')));

  const handleError: ErrorRequestHandler = (error, _req, res, next) => {
    if (res.headersSent) return next(error);
    if (error instanceof ApiError) {
      res.status(error.status).json({ error: { code: error.code, message: error.message, fields: error.fields } });
      return;
    }
    if (error?.type === 'entity.parse.failed' || error?.status === 400) {
      res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Format permintaan tidak valid.' } });
      return;
    }
    if (error?.type === 'entity.too.large') {
      res.status(413).json({ error: { code: 'PAYLOAD_TOO_LARGE', message: 'Ukuran permintaan melebihi batas.' } });
      return;
    }
    if (error?.status === 415) {
      res.status(415).json({ error: { code: 'UNSUPPORTED_MEDIA_TYPE', message: 'Format atau enkode permintaan tidak didukung.' } });
      return;
    }
    if (error?.status === 404) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Halaman tidak ditemukan.' } });
      return;
    }
    const requestId = res.get('X-Request-Id');
    console.error('Request failed', { requestId, error: error instanceof Error ? error.name : 'UnknownError' });
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Terjadi kesalahan. Silakan coba lagi.', requestId } });
  };
  app.use(handleError);
  return app;
}
