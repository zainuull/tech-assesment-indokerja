import { createHmac, randomBytes } from 'node:crypto';
import type { CookieOptions, Express, Request, RequestHandler, Response } from 'express';
import { rateLimit } from 'express-rate-limit';
import type { PrismaClient, Role } from '../generated/prisma/client';
import type { User } from '../shared/domain';
import { verifyPassword } from './password';
import { ApiError, loginSchema, validateJson } from './validation';

const publicUser = { id: true, name: true, email: true, role: true } as const;
const maxAge = 8 * 60 * 60 * 1000;
const unauthorized = () => new ApiError(401, 'UNAUTHORIZED', 'Silakan masuk untuk melanjutkan.');

export function currentUser(res: Response): User {
  return res.locals.user;
}

function requireBrowserRequest(req: Request) {
  if (req.get('X-IndoKerja-Request') !== '1' || req.get('Sec-Fetch-Site') === 'cross-site') {
    throw new ApiError(403, 'REQUEST_ORIGIN', 'Permintaan harus berasal dari aplikasi IndoKerja.');
  }
}

export function registerAuth(app: Express, db: PrismaClient, secret: string, secure: boolean) {
  const cookieName = secure ? '__Host-indokerja_session' : 'indokerja_session';
  const cookieOptions: CookieOptions = { httpOnly: true, sameSite: 'strict', secure, path: '/' };
  const digest = (token: string) => createHmac('sha256', secret).update(token).digest('hex');

  function cookie(req: Request) {
    return req.get('Cookie')?.split(';').map(part => part.trim())
      .find(part => part.startsWith(`${cookieName}=`))?.slice(cookieName.length + 1);
  }

  function credential(req: Request) {
    const header = req.get('Authorization');
    const browser = header === undefined;
    const token = browser ? cookie(req) : /^Bearer (\S+)$/i.exec(header)?.[1];
    if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) return;
    return { browser, tokenHash: digest(token) };
  }

  function auth(role?: Role): RequestHandler {
    return async (req, res, next) => {
      const session = credential(req);
      if (!session) throw unauthorized();
      if (session.browser && req.method !== 'GET' && req.method !== 'HEAD') requireBrowserRequest(req);

      const record = await db.authSession.findUnique({
        where: { tokenHash: session.tokenHash, expiresAt: { gt: new Date() } },
        select: { user: { select: publicUser } },
      });
      const expected = session.browser ? req.get('X-IndoKerja-User') : undefined;
      if (!record || (expected && expected !== record.user.id)) throw unauthorized();
      if (role && record.user.role !== role) {
        throw new ApiError(403, 'FORBIDDEN', 'Akun ini tidak memiliki izin untuk tindakan tersebut.');
      }
      res.locals.user = record.user;
      next();
    };
  }

  // shortcut: the rate limiter is per process, use a shared store before scaling replicas.
  const loginLimit = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 30,
    skipSuccessfulRequests: true,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler: () => { throw new ApiError(429, 'TOO_MANY_ATTEMPTS', 'Terlalu banyak percobaan masuk. Coba lagi nanti.'); },
  });

  function signIn(browser: boolean): RequestHandler {
    return async (req, res) => {
      if (browser) requireBrowserRequest(req);
      const { email, password } = validateJson(loginSchema, req);
      const record = await db.user.findUnique({ where: { email }, select: { ...publicUser, passwordHash: true } });
      const { valid, upgradedHash } = await verifyPassword(password, record?.passwordHash);
      if (!record || !valid) throw new ApiError(401, 'INVALID_CREDENTIALS', 'Email atau kata sandi salah.');
      if (upgradedHash) {
        await db.user.updateMany({ where: { id: record.id, passwordHash: record.passwordHash }, data: { passwordHash: upgradedHash } });
      }

      const token = randomBytes(32).toString('base64url');
      const tokenHash = digest(token);
      const now = new Date();
      const expiresAt = new Date(now.getTime() + maxAge);
      const previous = browser ? cookie(req) : undefined;
      await db.$transaction([
        db.authSession.deleteMany({ where: { OR: [
          { expiresAt: { lte: now } },
          ...(previous ? [{ tokenHash: digest(previous) }] : []),
        ] } }),
        db.authSession.create({ data: { tokenHash, userId: record.id, expiresAt } }),
      ]);
      const { id, name, role } = record;
      const user = { id, name, email, role };
      if (browser) {
        res.cookie(cookieName, token, { ...cookieOptions, maxAge }).json(user);
      } else {
        res.json({ token, user });
      }
    };
  }

  app.post('/api/auth/login', loginLimit, signIn(false));
  app.post('/api/auth/session', loginLimit, signIn(true));
  app.get('/api/auth/me', auth(), (_req, res) => {
    res.json(currentUser(res));
  });
  app.post('/api/auth/logout', async (req, res) => {
    const session = credential(req);
    if (req.get('Authorization') === undefined) {
      requireBrowserRequest(req);
      const userId = req.get('X-IndoKerja-User');
      if (session) {
        const deleted = await db.authSession.deleteMany({
          where: { tokenHash: session.tokenHash, userId: userId || undefined },
        });
        if (userId && deleted.count === 0 && await db.authSession.findUnique({
          where: { tokenHash: session.tokenHash },
          select: { tokenHash: true },
        })) throw unauthorized();
      }
      res.clearCookie(cookieName, cookieOptions);
    } else if (session) {
      await db.authSession.deleteMany({ where: { tokenHash: session.tokenHash } });
    }
    res.sendStatus(204);
  });

  return auth;
}
