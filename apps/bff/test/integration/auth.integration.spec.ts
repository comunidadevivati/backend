import { createHash, randomBytes } from 'node:crypto';
import cookie from '@fastify/cookie';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { hashPassword } from '../../src/auth/infrastructure/password/password-hasher.js';
import { insertUser } from '../../src/auth/infrastructure/users/user.repository.js';
import {
  createDatabase,
  type DatabaseConnection,
} from '../../src/shared/infrastructure/database/database.js';

const COOKIE_SECRET = randomBytes(32).toString('base64url');

const PASSWORD = 'senha-de-teste-123';

let container: StartedPostgreSqlContainer;

let app: NestFastifyApplication;

let connection: DatabaseConnection;

const sha256 = (value: string) => createHash('sha256').update(value).digest('base64url');

const login = (email: string, password: string, sessionCookie?: string) =>
  app.inject({
    method: 'POST',
    url: '/auth/login',
    payload: { email, password },
    ...(sessionCookie ? { headers: { cookie: sessionCookie } } : {}),
  });

const getMe = (sessionCookie: string) =>
  app.inject({ method: 'GET', url: '/auth/me', headers: { cookie: sessionCookie } });

const logout = (sessionCookie: string, csrfToken?: string) =>
  app.inject({
    method: 'POST',
    url: '/auth/logout',
    headers: { cookie: sessionCookie, ...(csrfToken ? { 'x-csrf-token': csrfToken } : {}) },
  });

type InjectResponse = Awaited<ReturnType<typeof login>>;

const sessionCookieOf = (response: InjectResponse): string => {
  const sessionCookie = response.cookies.find(({ name }) => name === 'comvivati_session');

  expect(sessionCookie).toBeDefined();

  return `comvivati_session=${sessionCookie!.value}`;
};

// Valor do cookie assinado: "<token>.<assinatura>".
const sessionTokenOf = (response: InjectResponse): string =>
  sessionCookieOf(response).split('=')[1]!.split('.')[0]!;

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
  const { AppModule } = await import('../../src/app.module.js');

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

describe('POST /auth/login (PostgreSQL real)', () => {
  it('deve recusar senha incorreta e e-mail inexistente com a mesma resposta', async () => {
    const wrongPassword = await login('membro@exemplo.com', 'senha-errada');

    const unknownEmail = await login('ninguem@exemplo.com', PASSWORD);

    expect(wrongPassword.statusCode).toBe(401);

    expect(unknownEmail.statusCode).toBe(401);

    expect(wrongPassword.json()).toEqual(unknownEmail.json());

    expect(wrongPassword.cookies).toHaveLength(0);
  });

  it('deve recusar usuários suspensos', async () => {
    expect((await login('suspenso@exemplo.com', PASSWORD)).statusCode).toBe(401);
  });

  it('deve recusar corpo inválido', async () => {
    expect((await login('nao-e-email', PASSWORD)).statusCode).toBe(400);
  });

  it('deve autenticar com e-mail normalizado e emitir cookie HttpOnly', async () => {
    const response = await login('  MEMBRO@exemplo.com ', PASSWORD);

    expect(response.statusCode).toBe(200);

    expect(response.headers['cache-control']).toBe('no-store');

    expect(response.json()).toEqual({
      authenticated: true,
      csrfToken: expect.stringMatching(/^[\w-]{43}$/u),
      user: {
        subject: expect.stringMatching(/^[\da-f-]{36}$/u),
        email: 'membro@exemplo.com',
        name: 'Membro Ativo',
      },
    });

    const setCookie = String(response.headers['set-cookie']);

    expect(setCookie).toContain('HttpOnly');

    expect(setCookie).toContain('SameSite=Lax');
  });
});

describe('Sessões no PostgreSQL (PostgreSQL real)', () => {
  it('deve persistir somente o hash do token de sessão', async () => {
    const token = sessionTokenOf(await login('membro@exemplo.com', PASSWORD));

    const { rows } = await connection.pool.query<{ token_hash: string }>(
      'select token_hash from auth.sessions',
    );

    expect(rows.map(({ token_hash }) => token_hash)).toContain(sha256(token));

    expect(rows.map(({ token_hash }) => token_hash)).not.toContain(token);
  });

  it('deve revogar a sessão anterior ao autenticar novamente no mesmo navegador', async () => {
    const first = sessionCookieOf(await login('membro@exemplo.com', PASSWORD));

    expect((await login('membro@exemplo.com', PASSWORD, first)).statusCode).toBe(200);

    expect((await getMe(first)).statusCode).toBe(401);
  });
});

describe('GET /auth/me e POST /auth/logout (PostgreSQL real)', () => {
  it('deve expor a sessão em /auth/me e encerrá-la no logout com CSRF', async () => {
    const response = await login('membro@exemplo.com', PASSWORD);

    const sessionCookie = sessionCookieOf(response);

    const body = response.json<{ csrfToken: string }>();

    const me = await getMe(sessionCookie);

    expect(me.statusCode).toBe(200);

    expect(me.json()).toEqual(body);

    expect((await logout(sessionCookie)).statusCode).toBe(403);

    expect((await logout(sessionCookie, body.csrfToken)).statusCode).toBe(204);

    expect((await getMe(sessionCookie)).statusCode).toBe(401);
  });

  it('deve renovar a sessão por inatividade e recusá-la após expirar', async () => {
    const response = await login('membro@exemplo.com', PASSWORD);

    const sessionCookie = sessionCookieOf(response);

    const tokenHash = sha256(sessionTokenOf(response));

    const setExpiration = (interval: string) =>
      connection.pool.query(
        'update auth.sessions set expires_at = now() + $2::interval where token_hash = $1',
        [tokenHash, interval],
      );

    await setExpiration('1 minute');

    expect((await getMe(sessionCookie)).statusCode).toBe(200);

    const { rows } = await connection.pool.query<{ renewed: boolean }>(
      "select expires_at > now() + interval '29 minutes' as renewed from auth.sessions where token_hash = $1",
      [tokenHash],
    );

    expect(rows[0]?.renewed).toBe(true);

    await setExpiration('-1 second');

    expect((await getMe(sessionCookie)).statusCode).toBe(401);
  });
});
