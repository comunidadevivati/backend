import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createDatabase, runMigrations, type Database } from './database.js';
import { DatabaseService } from './database.service.js';
import type { ConfigService } from '@nestjs/config';

const pgMocks = vi.hoisted(() => ({
  end: vi.fn(),
  on: vi.fn(),
  options: [] as unknown[],
}));

const migrateMock = vi.hoisted(() => vi.fn());

vi.mock('pg', () => ({
  Pool: class {
    end = pgMocks.end;

    on = pgMocks.on;

    constructor(options: unknown) {
      pgMocks.options.push(options);
    }
  },
}));

vi.mock('drizzle-orm/node-postgres/migrator', () => ({ migrate: migrateMock }));

const databaseUrl = 'postgresql://usuario:senha@localhost:5432/comunidade_viva';

describe('createDatabase', () => {
  beforeEach(() => {
    pgMocks.options.length = 0;
  });

  it('deve criar um pool limitado para a URL configurada', () => {
    const { db, pool } = createDatabase(databaseUrl);

    expect(pool).toBeDefined();

    expect(db).toBeDefined();

    expect(pgMocks.options[0]).toMatchObject({ connectionString: databaseUrl, max: 5 });
  });
});

describe('runMigrations', () => {
  it('deve aplicar as migrations versionadas do BFF no schema auth', async () => {
    const db = {} as Database;

    await runMigrations(db);

    expect(migrateMock).toHaveBeenCalledWith(db, {
      migrationsFolder: expect.stringMatching(/[/\\]apps[/\\]bff[/\\]drizzle$/u),
      migrationsSchema: 'auth',
    });
  });
});

const createService = () =>
  new DatabaseService({ getOrThrow: vi.fn(() => databaseUrl) } as unknown as ConfigService);

describe('DatabaseService', () => {
  it('deve registrar tratamento de erros de conexões ociosas', () => {
    createService();

    const [event, handler] = pgMocks.on.mock.lastCall as [string, (error: Error) => void];

    expect(event).toBe('error');

    expect(() => {
      handler(new Error('conexão encerrada pelo servidor'));
    }).not.toThrow();
  });

  it('deve aplicar as migrations ao iniciar e encerrar o pool ao finalizar', async () => {
    const service = createService();

    await service.onModuleInit();

    expect(migrateMock).toHaveBeenCalledWith(service.db, expect.anything());

    await service.onModuleDestroy();

    expect(pgMocks.end).toHaveBeenCalled();
  });
});
