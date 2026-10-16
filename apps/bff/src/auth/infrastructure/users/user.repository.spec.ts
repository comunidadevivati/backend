import { describe, expect, it } from 'vitest';
import { insertUser, normalizeEmail, UserRepository } from './user.repository.js';
import type { Database } from '../../../shared/infrastructure/database/database.js';
import type { DatabaseService } from '../../../shared/infrastructure/database/database.service.js';

interface RecordedCall {
  method: string;
  args: unknown[];
}

// Simula o query builder do Drizzle; o SQL real é coberto pelo teste de integração.
const createDatabaseMock = (results: unknown[][] = []) => {
  const calls: RecordedCall[] = [];

  const queue = [...results];

  const chain: object = new Proxy(
    {},
    {
      get: (_target, property) => {
        if (property === 'then') {
          const result = queue.shift() ?? [];

          return (resolve: (value: unknown) => void) => {
            resolve(result);
          };
        }

        return (...args: unknown[]) => {
          calls.push({ method: String(property), args });

          return chain;
        };
      },
    },
  );

  return { calls, db: chain as Database };
};

describe('normalizeEmail', () => {
  it('deve remover espaços e converter para minúsculas', () => {
    expect(normalizeEmail('  Pessoa@Exemplo.COM ')).toBe('pessoa@exemplo.com');
  });
});

describe('UserRepository', () => {
  it('deve retornar as credenciais do usuário encontrado', async () => {
    const user = {
      id: 'usuario-1',
      email: 'pessoa@exemplo.com',
      name: 'Pessoa',
      passwordHash: 'hash',
      status: 'ACTIVE',
    };

    const { db } = createDatabaseMock([[user]]);

    const repository = new UserRepository({ db } as DatabaseService);

    await expect(repository.findByEmail('Pessoa@Exemplo.com')).resolves.toEqual(user);
  });

  it('deve retornar null quando o e-mail não existir', async () => {
    const { db } = createDatabaseMock([[]]);

    const repository = new UserRepository({ db } as DatabaseService);

    await expect(repository.findByEmail('ninguem@exemplo.com')).resolves.toBeNull();
  });
});

describe('UserRepository.create', () => {
  it('deve gravar o telefone informado no cadastro', async () => {
    const { calls, db } = createDatabaseMock();

    const repository = new UserRepository({ db } as DatabaseService);

    const id = await repository.create({
      email: 'pessoa@exemplo.com',
      name: 'Pessoa Exemplo',
      passwordHash: 'scrypt$hash',
      phone: '67991234567',
    });

    expect(calls.find(({ method }) => method === 'values')?.args[0]).toMatchObject({
      id,
      phone: '67991234567',
    });
  });
});

describe('insertUser', () => {
  it('deve gravar o usuário normalizado com identificador UUIDv7', async () => {
    const { calls, db } = createDatabaseMock();

    const id = await insertUser(db, {
      email: ' Pessoa@Exemplo.com ',
      name: '  Pessoa Exemplo ',
      passwordHash: 'scrypt$hash',
    });

    expect(id).toMatch(/^[\da-f]{8}-[\da-f]{4}-7/u);

    expect(calls.find(({ method }) => method === 'values')?.args[0]).toEqual({
      id,
      email: 'pessoa@exemplo.com',
      name: 'Pessoa Exemplo',
      passwordHash: 'scrypt$hash',
    });
  });
});
