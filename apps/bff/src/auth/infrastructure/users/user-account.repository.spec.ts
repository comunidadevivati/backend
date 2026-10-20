import { describe, expect, it } from 'vitest';
import { UserAccountRepository } from './user-account.repository.js';
import type { Database } from '../../../shared/infrastructure/database/database.js';
import type { DatabaseService } from '../../../shared/infrastructure/database/database.service.js';

interface RecordedCall {
  method: string;
  args: unknown[];
}

// Simula o query builder do Drizzle; o SQL real é coberto pelo teste de integração.
const createRepository = (results: unknown[][] = []) => {
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

  const repository = new UserAccountRepository({ db: chain as Database } as DatabaseService);

  return { calls, repository };
};

describe('UserAccountRepository.list', () => {
  it.each([true, false])('deve filtrar por conversão em Pessoa (%s)', async (hasPerson) => {
    const { calls, repository } = createRepository([[]]);

    await repository.list({
      status: 'ACTIVE',
      emailVerified: true,
      hasPerson,
      search: 'paula',
      after: 'u-0',
      limit: 21,
    });

    expect(calls.find(({ method }) => method === 'where')?.args[0]).toBeDefined();

    expect(calls.find(({ method }) => method === 'limit')?.args).toEqual([21]);
  });
});
