// Ambiente compartilhado dos testes de integração da autenticação: PostgreSQL real em container,
// BFF completo (migrations incluídas) e usuários de exemplo. Importar este módulo registra os hooks.
import { createHash, randomBytes } from 'node:crypto';
import cookie from '@fastify/cookie';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, expect } from 'vitest';
import { hashPassword } from '../../../src/auth/infrastructure/password/password-hasher.js';
import { insertUser } from '../../../src/auth/infrastructure/users/user.repository.js';
import {
  createDatabase,
  type DatabaseConnection,
} from '../../../src/shared/infrastructure/database/database.js';

const COOKIE_SECRET = randomBytes(32).toString('base64url');

export const PASSWORD = 'senha-de-teste-123';

let container: StartedPostgreSqlContainer;

export let app: NestFastifyApplication;

export let connection: DatabaseConnection;

export const sha256 = (value: string) => createHash('sha256').update(value).digest('base64url');

export const login = (email: string, password: string, sessionCookie?: string) =>
  app.inject({
    method: 'POST',
    url: '/auth/login',
    payload: { email, password },
    ...(sessionCookie ? { headers: { cookie: sessionCookie } } : {}),
  });

export const getMe = (sessionCookie: string) =>
  app.inject({ method: 'GET', url: '/auth/me', headers: { cookie: sessionCookie } });

export const logout = (sessionCookie: string, csrfToken?: string) =>
  app.inject({
    method: 'POST',
    url: '/auth/logout',
    headers: { cookie: sessionCookie, ...(csrfToken ? { 'x-csrf-token': csrfToken } : {}) },
  });

type InjectResponse = Awaited<ReturnType<typeof login>>;

export const sessionCookieOf = (response: InjectResponse): string => {
  const sessionCookie = response.cookies.find(({ name }) => name === 'comvivati_session');

  expect(sessionCookie).toBeDefined();

  return `comvivati_session=${sessionCookie?.value ?? ''}`;
};

// Valor do cookie assinado: "<token>.<assinatura>".
export const sessionTokenOf = (response: InjectResponse): string =>
  /^comvivati_session=([^.]+)\./u.exec(sessionCookieOf(response))?.[1] ?? '';

const seedUsers = async (): Promise<void> => {
  const passwordHash = await hashPassword(PASSWORD);

  await insertUser(connection.db, {
    email: 'Membro@Exemplo.com',
    name: 'Membro Ativo',
    passwordHash,
  });

  await insertUser(connection.db, {
    email: 'suspenso@exemplo.com',
    name: 'Membro Suspenso',
    passwordHash,
  });

  await connection.db.execute(
    sql`update auth.users set status = 'SUSPENDED' where email = 'suspenso@exemplo.com'`,
  );
};

beforeAll(async () => {
  container = await new PostgreSqlContainer('postgres:18-alpine').start();

  Object.assign(process.env, {
    NODE_ENV: 'test',
    BFF_PORT: '3000',
    BFF_BASE_URL: 'http://localhost:3000',
    WEB_BASE_URL: 'http://localhost:5173',
    COOKIE_SECRET,
    DATABASE_URL: container.getConnectionUri(),
  });

  // O ConfigModule valida o ambiente ao carregar o módulo: importa somente após configurá-lo.
  const { AppModule } = await import('../../../src/app.module.js');

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();

  app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());

  await app.register(cookie, { secret: COOKIE_SECRET });

  // Aplica as migrations (DatabaseService.onModuleInit).
  await app.init();

  await app.getHttpAdapter().getInstance().ready();

  connection = createDatabase(container.getConnectionUri());

  await seedUsers();
}, 120_000);

afterAll(async () => {
  await connection?.pool.end();

  await app?.close();

  await container?.stop();
});
