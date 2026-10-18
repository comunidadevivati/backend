import { randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from 'node:crypto';

// Parâmetros recomendados pela OWASP para scrypt (N=2^15, r=8, p=3), cerca de 32 MiB por hash.
const COST = 2 ** 15;

const BLOCK_SIZE = 8;

const PARALLELIZATION = 3;

const KEY_LENGTH = 64;

const SALT_LENGTH = 16;

const PREFIX = 'scrypt';

const deriveKey = (password: string, salt: Buffer, options: ScryptOptions): Promise<Buffer> =>
  new Promise((resolve, reject) => {
    scrypt(password.normalize('NFKC'), salt, KEY_LENGTH, options, (error, key) => {
      if (error) {
        reject(error);

        return;
      }

      resolve(key);
    });
  });

const toOptions = (cost: number, blockSize: number, parallelization: number): ScryptOptions => ({
  N: cost,
  r: blockSize,
  p: parallelization,
  maxmem: 256 * cost * blockSize,
});

// Formato: scrypt$N$r$p$salt$hash (salt e hash em base64url).
export const hashPassword = async (password: string): Promise<string> => {
  const salt = randomBytes(SALT_LENGTH);

  const key = await deriveKey(password, salt, toOptions(COST, BLOCK_SIZE, PARALLELIZATION));

  return [
    PREFIX,
    COST,
    BLOCK_SIZE,
    PARALLELIZATION,
    salt.toString('base64url'),
    key.toString('base64url'),
  ].join('$');
};

export const verifyPassword = async (password: string, storedHash: string): Promise<boolean> => {
  const [prefix, cost, blockSize, parallelization, salt, hash] = storedHash.split('$');

  if (prefix !== PREFIX || !cost || !blockSize || !parallelization || !salt || !hash) {
    return false;
  }

  const expected = Buffer.from(hash, 'base64url');

  const options = toOptions(Number(cost), Number(blockSize), Number(parallelization));

  const key = await deriveKey(password, Buffer.from(salt, 'base64url'), options);

  return key.length === expected.length && timingSafeEqual(key, expected);
};
