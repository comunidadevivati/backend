import { describe, expect, it, vi } from 'vitest';
import { UserPersonLinkRepository } from './user-person-link.repository.js';
import type { Database } from '../../../shared/infrastructure/database/database.js';
import type { DatabaseService } from '../../../shared/infrastructure/database/database.service.js';

interface RecordedCall {
  method: string;
  args: unknown[];
}

// Simula o query builder do Drizzle (inclusive transaction); o SQL real é coberto pelo teste de
// integração.
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

        if (property === 'transaction') {
          return (work: (transaction: object) => Promise<unknown>) => work(chain);
        }

        return (...args: unknown[]) => {
          calls.push({ method: String(property), args });

          return chain;
        };
      },
    },
  );

  const repository = new UserPersonLinkRepository({ db: chain as Database } as DatabaseService);

  return { calls, repository };
};

const PERSON_ID = '01a14f8e-d000-7000-8000-000000000050';

const source = {
  name: 'Paula Ribeiro',
  email: 'paula@exemplo.com',
  phone: '67991112233',
};

describe('UserPersonLinkRepository.linkPerson', () => {
  it('deve bloquear a conta, criar a Pessoa e gravar o vínculo', async () => {
    const { calls, repository } = createRepository([
      [{ ...source, emailVerifiedAt: new Date(), personId: null }],
      [],
    ]);

    const createPerson = vi.fn(() => Promise.resolve<string | null>(PERSON_ID));

    await expect(repository.linkPerson('u-1', createPerson)).resolves.toEqual({
      status: 'linked',
      personId: PERSON_ID,
    });

    expect(createPerson).toHaveBeenCalledWith({ accountId: 'u-1', ...source });

    expect(calls.map(({ method }) => method)).toContain('for');

    expect(calls.find(({ method }) => method === 'set')?.args[0]).toMatchObject({
      personId: PERSON_ID,
    });
  });

  it.each([
    ['inexistente', [], { status: 'not_found' }],
    [
      'já convertida',
      [{ ...source, emailVerifiedAt: new Date(), personId: PERSON_ID }],
      { status: 'already_linked', personId: PERSON_ID },
    ],
    [
      'com e-mail não verificado',
      [{ ...source, emailVerifiedAt: null, personId: null }],
      { status: 'unverified' },
    ],
  ])('não deve criar Pessoa para conta %s', async (_caso, rows, expected) => {
    const { calls, repository } = createRepository([rows]);

    const createPerson = vi.fn(() => Promise.resolve<string | null>(PERSON_ID));

    await expect(repository.linkPerson('u-1', createPerson)).resolves.toEqual(expected);

    expect(createPerson).not.toHaveBeenCalled();

    expect(calls.some(({ method }) => method === 'update')).toBe(false);
  });

  it('não deve gravar vínculo quando a criação da Pessoa é recusada', async () => {
    const { calls, repository } = createRepository([
      [{ ...source, emailVerifiedAt: new Date(), personId: null }],
    ]);

    await expect(repository.linkPerson('u-1', () => Promise.resolve(null))).resolves.toEqual({
      status: 'rejected',
    });

    expect(calls.some(({ method }) => method === 'update')).toBe(false);
  });
});
