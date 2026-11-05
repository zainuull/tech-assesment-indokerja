import { resolve } from 'node:path';
import { ApplicationStatus, Prisma, PrismaClient, Role } from '../generated/prisma/client';
import express, { type RequestHandler, type ErrorRequestHandler } from 'express';
import { rateLimit } from 'express-rate-limit';
import helmet from 'helmet';
import jwt from 'jsonwebtoken';
import { verifyPassword } from './password';
import { ApiError, idSchema, jobSchema, loginSchema, searchSchema, statusSchema, validate } from './validation';

const publicUser = { id: true, name: true, email: true, role: true } as const;
const company = { select: { id: true, name: true } } as const;
const history = {
  select: { id: true, fromStatus: true, toStatus: true, changedAt: true },
  orderBy: { id: 'asc' },
} as const;

const jobMissing = () => new ApiError(404, 'JOB_NOT_FOUND', 'Lowongan tidak ditemukan.');
const unauthorized = () => new ApiError(401, 'UNAUTHORIZED', 'Silakan masuk untuk melanjutkan.');
const notFound = () => new ApiError(404, 'NOT_FOUND', 'Endpoint tidak ditemukan.');

export function createApp(db: PrismaClient, secret: string, trustProxy = false) {
  const app = express();
  app.disable('x-powered-by');
  if (trustProxy) app.set('trust proxy', 1);
  app.use(helmet({
    strictTransportSecurity: trustProxy ? undefined : false,
    contentSecurityPolicy: {
      directives: { upgradeInsecureRequests: trustProxy ? [] : null },
    },
  }));
  app.use('/api', (_req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });
  app.use('/api', express.json({ limit: '32kb' }));

  function auth(role?: Role): RequestHandler {
    return async (req, res, next) => {
      const match = /^Bearer (\S+)$/i.exec(req.get('Authorization') ?? '');
      if (!match) throw unauthorized();

      let userId: string;
      try {
        const payload = jwt.verify(match[1], secret, {
          algorithms: ['HS256'],
          issuer: 'indokerja',
          audience: 'indokerja-api',
        });
        if (typeof payload === 'string' || !idSchema.safeParse(payload.sub).success) throw unauthorized();
        userId = payload.sub!;
      } catch {
        throw unauthorized();
      }

      const user = await db.user.findUnique({ where: { id: userId }, select: publicUser });
      if (!user) throw unauthorized();
      if (role && user.role !== role) {
        throw new ApiError(403, 'FORBIDDEN', 'Akun ini tidak memiliki izin untuk tindakan tersebut.');
      }
      res.locals.user = user;
      next();
    };
  }

  const loginLimit = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 30,
    skipSuccessfulRequests: true,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler: () => { throw new ApiError(429, 'TOO_MANY_ATTEMPTS', 'Terlalu banyak percobaan masuk. Coba lagi nanti.'); },
  });

  app.get('/api/health', async (_req, res) => {
    await db.$queryRaw`SELECT 1`;
    res.json({ status: 'ok' });
  });

  app.post('/api/auth/login', loginLimit, async (req, res) => {
    const { email, password } = validate(loginSchema, req.body);
    const user = await db.user.findUnique({ where: { email }, select: { ...publicUser, passwordHash: true } });
    const matches = await verifyPassword(password, user?.passwordHash);
    if (!user || !matches) throw new ApiError(401, 'INVALID_CREDENTIALS', 'Email atau kata sandi salah.');

    const token = jwt.sign({}, secret, {
      algorithm: 'HS256',
      subject: user.id,
      expiresIn: '8h',
      issuer: 'indokerja',
      audience: 'indokerja-api',
    });
    res.json({ token, user: { id: user.id, name: user.name, email: user.email, role: user.role } });
  });

  app.get('/api/auth/me', auth(), (_req, res) => {
    res.json(res.locals.user);
  });

  app.get('/api/jobs', async (req, res) => {
    const { q, location, jobType } = validate(searchSchema, req.query);
    const contains = (value: string) => ({
      contains: value.replace(/[\\%_]/g, '\\$&'),
      mode: 'insensitive' as const,
    });
    const jobs = await db.job.findMany({
      where: {
        jobType,
        location: location ? contains(location) : undefined,
        OR: q ? [{ title: contains(q) }, { company: { name: contains(q) } }] : undefined,
      },
      include: { company },
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
    });
    res.json(jobs);
  });

  app.get('/api/jobs/mine', auth(Role.COMPANY), async (_req, res) => {
    const jobs = await db.job.findMany({
      where: { companyId: res.locals.user.id },
      include: { company, _count: { select: { applications: true } } },
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
    });
    res.json(jobs);
  });

  app.get('/api/jobs/:jobId', async (req, res) => {
    const id = validate(idSchema, req.params.jobId);
    const job = await db.job.findUnique({ where: { id }, include: { company } });
    if (!job) throw jobMissing();
    res.json(job);
  });

  app.post('/api/jobs', auth(Role.COMPANY), async (req, res) => {
    const data = validate(jobSchema, req.body);
    const job = await db.job.create({
      data: { ...data, companyId: res.locals.user.id },
      include: { company },
    });
    res.status(201).json(job);
  });

  app.post('/api/jobs/:jobId/applications', auth(Role.JOB_SEEKER), async (req, res) => {
    const jobId = validate(idSchema, req.params.jobId);
    const seekerId = res.locals.user.id;
    if (!await db.job.findUnique({ where: { id: jobId }, select: { id: true } })) throw jobMissing();

    try {
      const application = await db.application.create({
        data: {
          jobId, seekerId,
          history: { create: { toStatus: ApplicationStatus.APPLIED, changedBy: seekerId } },
        },
        include: { history },
      });
      res.status(201).json(application);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ApiError(409, 'ALREADY_APPLIED', 'Kamu sudah melamar lowongan ini.');
      }
      throw error;
    }
  });

  app.get('/api/applications/me', auth(Role.JOB_SEEKER), async (_req, res) => {
    const applications = await db.application.findMany({
      where: { seekerId: res.locals.user.id },
      include: { job: { include: { company } }, history },
      orderBy: [{ appliedAt: 'desc' }, { id: 'asc' }],
    });
    res.json(applications);
  });

  app.get('/api/jobs/:jobId/applications', auth(Role.COMPANY), async (req, res) => {
    const id = validate(idSchema, req.params.jobId);
    const job = await db.job.findUnique({
      where: { id, companyId: res.locals.user.id },
      include: {
        company,
        applications: {
          select: { id: true, status: true, appliedAt: true, seeker: { select: { name: true, email: true } } },
          orderBy: [{ appliedAt: 'desc' }, { id: 'asc' }],
        },
      },
    });
    if (!job) throw jobMissing();
    res.json(job);
  });

  app.patch('/api/applications/:applicationId/status', auth(Role.COMPANY), async (req, res) => {
    const id = validate(idSchema, req.params.applicationId);
    const parsed = statusSchema.safeParse(req.body);
    if (!parsed.success) throw new ApiError(400, 'INVALID_STATUS', 'Pilih status lamaran yang tersedia.');
    const { status } = parsed.data;
    const companyId = res.locals.user.id;

    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        const application = await db.$transaction(async tx => {
          const current = await tx.application.findUnique({
            where: { id, job: { companyId } },
            include: { history },
          });
          if (!current) throw new ApiError(404, 'APPLICATION_NOT_FOUND', 'Lamaran tidak ditemukan.');
          if (current.status === status) return current;

          return tx.application.update({
            where: { id },
            data: {
              status,
              history: { create: { fromStatus: current.status, toStatus: status, changedBy: companyId } },
            },
            include: { history },
          });
        }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
        res.json(application);
        return;
      } catch (error) {
        if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034')) throw error;
      }
    }
    throw new ApiError(409, 'STATUS_CONFLICT', 'Status baru saja berubah. Muat ulang kandidat lalu coba lagi.');
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
    if (error?.status === 404) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Halaman tidak ditemukan.' } });
      return;
    }
    console.error('Request failed', error instanceof Error ? error.name : 'UnknownError');
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Terjadi kesalahan. Silakan coba lagi.' } });
  };
  app.use(handleError);
  return app;
}
