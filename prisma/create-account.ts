import 'dotenv/config';
import { z } from 'zod';
import { createDb } from '../server/db';
import { hashPassword } from '../server/password';
import { loginSchema } from '../server/validation';

const account = z.object({
  name: z.string().trim().min(1).max(120),
  role: z.enum(['JOB_SEEKER', 'COMPANY']),
}).safeParse({ name: process.env.ACCOUNT_NAME, role: process.env.ACCOUNT_ROLE });
const credentials = loginSchema.safeParse({ email: process.env.ACCOUNT_EMAIL, password: process.env.ACCOUNT_PASSWORD });

if (!account.success || !credentials.success || credentials.data.password.length < 16) {
  throw new Error('Atur ACCOUNT_NAME, ACCOUNT_ROLE (JOB_SEEKER atau COMPANY), ACCOUNT_EMAIL, dan ACCOUNT_PASSWORD (16–128 karakter).');
}
if (!process.env.DATABASE_URL) throw new Error('Atur DATABASE_URL sebelum membuat akun.');

const db = createDb(process.env.DATABASE_URL);
try {
  const { email, password } = credentials.data;
  await db.user.create({ data: { ...account.data, email, passwordHash: await hashPassword(password) } });
  console.log(`Akun ${account.data.role} berhasil dibuat.`);
} catch {
  console.error('Gagal membuat akun. Periksa koneksi, migrasi database, dan pastikan email belum terdaftar.');
  process.exitCode = 1;
} finally {
  await db.$disconnect();
}
