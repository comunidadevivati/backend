import { stdin, stdout } from 'node:process';
import { createInterface } from 'node:readline/promises';
import { Writable } from 'node:stream';
import { parseArgs } from 'node:util';
import { z } from 'zod';
import { hashPassword } from '../auth/infrastructure/password/password-hasher.js';
import { insertUser } from '../auth/infrastructure/users/user.repository.js';
import { createDatabase, runMigrations } from '../shared/infrastructure/database/database.js';

/*
 * Cria um usuário com e-mail e senha:
 *   pnpm --dir apps/bff user:create --email pessoa@exemplo.com --name "Nome da Pessoa"
 *
 * A senha é solicitada sem eco no terminal ou lida de USER_PASSWORD (uso não interativo).
 * DATABASE_URL vem do ambiente, de .env.local ou de .env.
 */

const inputSchema = z.object({
  email: z.email().max(254),
  name: z.string().trim().min(1).max(120),
  password: z.string().min(8).max(1024),
});

const loadEnvFiles = (): void => {
  for (const file of ['.env.local', '.env']) {
    try {
      process.loadEnvFile(file);
    } catch {
      // Arquivo opcional.
    }
  }
};

const askPassword = async (): Promise<string> => {
  let muted = false;

  const output = new Writable({
    write: (chunk: Buffer, _encoding, callback) => {
      if (!muted) {
        stdout.write(chunk);
      }

      callback();
    },
  });

  const readline = createInterface({ input: stdin, output, terminal: stdin.isTTY });

  const answer = readline.question('Senha (mínimo de 8 caracteres): ');

  muted = true;

  const password = await answer;

  readline.close();

  stdout.write('\n');

  return password;
};

const isUniqueViolation = (error: unknown): boolean =>
  error instanceof Error &&
  [error, error.cause].some(
    (candidate) =>
      typeof candidate === 'object' &&
      candidate !== null &&
      'code' in candidate &&
      candidate.code === '23505',
  );

const main = async (): Promise<void> => {
  loadEnvFiles();

  const { values } = parseArgs({
    options: {
      email: { type: 'string' },
      name: { type: 'string' },
    },
  });

  const databaseUrl = process.env['DATABASE_URL'];

  if (!databaseUrl) {
    throw new Error('DATABASE_URL não configurada.');
  }

  const input = inputSchema.safeParse({
    ...values,
    password: process.env['USER_PASSWORD'] ?? (await askPassword()),
  });

  if (!input.success) {
    throw new Error(
      `Dados inválidos: ${input.error.issues.map((issue) => issue.path.join('.')).join(', ')}`,
    );
  }

  const { db, pool } = createDatabase(databaseUrl);

  try {
    await runMigrations(db);

    const id = await insertUser(db, {
      email: input.data.email,
      name: input.data.name,
      passwordHash: await hashPassword(input.data.password),
    });

    stdout.write(`Usuário criado: ${id}\n`);
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new Error('Já existe um usuário com este e-mail.', { cause: error });
    }

    throw error;
  } finally {
    await pool.end();
  }
};

try {
  await main();
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);

  process.exitCode = 1;
}
