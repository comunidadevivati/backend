// Ambiente compartilhado dos testes de integração da autenticação: PostgreSQL real em container,
// BFF completo (migrations incluídas) e usuários de exemplo. Importar este módulo registra os hooks.
import { createHash, randomBytes } from 'node:crypto';
import cookie from '@fastify/cookie';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, expect } from 'vitest';
import {
  EmailVerificationEmailSender,
  type SendEmailVerificationEmail,
} from '../../../src/auth/application/ports/email-verification-email-sender.js';
import {
  PasswordRecoveryEmailSender,
  type SendPasswordRecoveryEmail,
} from '../../../src/auth/application/ports/password-recovery-email-sender.js';
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

export const sentPasswordRecoveryEmails: SendPasswordRecoveryEmail[] = [];

export const sentEmailVerificationEmails: SendEmailVerificationEmail[] = [];

export const sha256 = (value: string) => createHash('sha256').update(value).digest('base64url');

export const login = (email: string, password: string, sessionCookie?: string) =>
  app.inject({
    method: 'POST',
    url: '/auth/login',
    payload: { email, password },
    ...(sessionCookie ? { headers: { cookie: sessionCookie } } : {}),
  });

export const requestPasswordRecovery = (email: string) =>
  app.inject({
    method: 'POST',
    url: '/auth/password-recovery',
    payload: { email },
  });

export const resetPassword = (token: string, password: string) =>
  app.inject({
    method: 'POST',
    url: '/auth/password-reset',
    payload: { token, password },
  });

export const verifyEmail = (token: string) =>
  app.inject({ method: 'POST', url: '/auth/email-verification', payload: { token } });

export const resendEmailVerification = (sessionCookie: string, csrfToken?: string) =>
  app.inject({
    method: 'POST',
    url: '/auth/email-verification/resend',
    headers: { cookie: sessionCookie, ...(csrfToken ? { 'x-csrf-token': csrfToken } : {}) },
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

  await insertUser(connection.db, {
    email: 'recuperacao@exemplo.com',
    name: 'Conta Recuperação',
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
    EMAIL_PROVIDER: 'disabled',
    PASSWORD_RESET_TTL_MINUTES: '15',
    PASSWORD_RESET_COOLDOWN_SECONDS: '0',
    EMAIL_VERIFICATION_TTL_HOURS: '24',
    EMAIL_VERIFICATION_COOLDOWN_SECONDS: '0',
    EMAIL_SEND_TIMEOUT_MS: '5000',
    // A autenticação não chama a Core API; o endereço só precisa ser válido.
    CORE_API_URL: 'http://localhost:3001',
    CORE_API_TOKEN: randomBytes(32).toString('base64url'),
  });

  // O ConfigModule valida o ambiente ao carregar o módulo: importa somente após configurá-lo.
  const { AppModule } = await import('../../../src/app.module.js');

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(PasswordRecoveryEmailSender)
    .useValue({
      send: (message: SendPasswordRecoveryEmail) => {
        sentPasswordRecoveryEmails.push(message);

        return Promise.resolve();
      },
    })
    .overrideProvider(EmailVerificationEmailSender)
    .useValue({
      send: (message: SendEmailVerificationEmail) => {
        sentEmailVerificationEmails.push(message);

        return Promise.resolve();
      },
    })
    .compile();

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
