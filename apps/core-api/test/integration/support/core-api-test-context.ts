// Ambiente compartilhado dos testes de integração: PostgreSQL real em container e a Core API
// completa (migrations e seed incluídos). Importar este módulo registra os hooks.
import { randomBytes } from 'node:crypto';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { afterAll, beforeAll } from 'vitest';

export const CORE_API_TOKEN = randomBytes(32).toString('base64url');

let container: StartedPostgreSqlContainer;

export let app: NestFastifyApplication;

// Preparações que precisam rodar antes de a Core API carregar (ex.: emulador S3 da galeria, que
// define variáveis de ambiente). Registradas ao importar o módulo, independem da ordem dos imports.
const beforeAppStart: (() => Promise<void>)[] = [];

export const registerBeforeAppStart = (setup: () => Promise<void>) => {
  beforeAppStart.push(setup);
};

type Method = 'GET' | 'POST' | 'PATCH' | 'DELETE';

export const call = (method: Method, url: string, payload?: object, token = CORE_API_TOKEN) =>
  app.inject({
    method,
    url: `/api/v1/${url}`,
    headers: { authorization: `Bearer ${token}` },
    ...(payload ? { payload } : {}),
  });

beforeAll(async () => {
  container = await new PostgreSqlContainer('postgres:18-alpine').start();

  Object.assign(process.env, {
    NODE_ENV: 'test',
    DATABASE_URL: container.getConnectionUri(),
    CORE_API_TOKEN,
  });

  for (const setup of beforeAppStart) {
    // oxlint-disable-next-line no-await-in-loop -- preparações em ordem de registro
    await setup();
  }

  // O ConfigModule valida o ambiente ao carregar o módulo: importa somente após configurá-lo.
  const { AppModule } = await import('../../../src/app.module.js');

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();

  app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());

  app.setGlobalPrefix('api/v1');

  // Aplica as migrations (DatabaseService.onModuleInit).
  await app.init();

  await app.getHttpAdapter().getInstance().ready();
}, 120_000);

afterAll(async () => {
  await app?.close();

  await container?.stop();
});
