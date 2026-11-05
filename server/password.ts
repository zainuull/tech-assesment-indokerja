import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const derive = promisify(scrypt);

export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString('hex');
  const key = (await derive(password, salt, 64)) as Buffer;
  return `${salt}:${key.toString('hex')}`;
}

export async function verifyPassword(password: string, storedHash?: string) {
  const [salt, hash] = (storedHash ?? `${'0'.repeat(32)}:${'0'.repeat(128)}`).split(':');
  const expected = Buffer.from(hash, 'hex');
  const actual = (await derive(password, salt, 64)) as Buffer;
  return expected.length === actual.length && timingSafeEqual(actual, expected) && Boolean(storedHash);
}
