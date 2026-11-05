import { randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from 'node:crypto';

const version = 'scrypt-v2';
const policy = { N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 };
const storedPattern = /^(?:(scrypt-v2):)?([0-9a-f]{32}):([0-9a-f]{128})$/;
const dummySalt = '0'.repeat(32);
const dummyKey = Buffer.alloc(64);

function derive(password: string, salt: string, options: ScryptOptions): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, 64, options, (error, key) => error ? reject(error) : resolve(key));
  });
}

export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString('hex');
  const key = await derive(password, salt, policy);
  return `${version}:${salt}:${key.toString('hex')}`;
}

export async function verifyPassword(password: string, storedHash?: string) {
  const stored = storedHash?.match(storedPattern);
  if (stored && !stored[1]) {
    const [key, upgradedHash] = await Promise.all([
      derive(password, stored[2], {}),
      hashPassword(password),
    ]);
    const valid = timingSafeEqual(key, Buffer.from(stored[3], 'hex'));
    return { valid, upgradedHash: valid ? upgradedHash : undefined };
  }
  const key = await derive(password, stored?.[2] ?? dummySalt, policy);
  const expected = stored ? Buffer.from(stored[3], 'hex') : dummyKey;
  return { valid: timingSafeEqual(key, expected) && Boolean(stored), upgradedHash: undefined };
}
