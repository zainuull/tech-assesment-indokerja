import 'dotenv/config';
import { createDb } from './db';
import { createApp } from './app';

const secret = process.env.SESSION_SECRET || process.env.JWT_SECRET;
if (!secret || Buffer.byteLength(secret) < 32) {
  throw new Error('Atur SESSION_SECRET minimal 32 byte sebelum menjalankan aplikasi.');
}
if (!process.env.DATABASE_URL) throw new Error('Atur DATABASE_URL sebelum menjalankan aplikasi.');

const port = Number(process.env.PORT ?? 3000);
const host = process.env.HOST ?? '127.0.0.1';
const db = createDb(process.env.DATABASE_URL);

await db.$connect();
const trustProxy = process.env.TRUST_PROXY === '1';
const secureCookies = process.env.NODE_ENV === 'production' || trustProxy;
const server = createApp(db, secret, trustProxy, secureCookies).listen(port, host, () => {
  console.log(`IndoKerja berjalan di http://${host}:${port}`);
});

function shutdown() {
  server.close(async () => { await db.$disconnect(); });
}
process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
