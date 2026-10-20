import { describe, expect, it } from 'vitest';
import { Member } from '../domain/member.js';
import { Membership } from '../domain/membership.js';
import { Person } from '../domain/person.js';
import { PersonName } from '../domain/value-objects/person-name.js';
import {
  DrizzleMemberQueries,
  DrizzleMemberRepository,
  DrizzleMembershipRepository,
} from './drizzle-members.repositories.js';
import type { Database } from '../../../shared/infrastructure/database/database.js';
import type { DatabaseService } from '../../../shared/infrastructure/database/database.service.js';

interface RecordedCall {
  method: string;
  args: unknown[];
}

// Simula o query builder do Drizzle (inclusive transaction): cada consulta aguardada consome o
// próximo resultado da fila; um Error na fila é lançado. O SQL real é coberto pela integração.
const createDatabase = (results: unknown[] = []) => {
  const calls: RecordedCall[] = [];

  const queue = [...results];

  const chain: object = new Proxy(
    {},
    {
      get: (_target, property) => {
        if (property === 'then') {
          const result = queue.shift() ?? [];

          return (resolve: (value: unknown) => void, reject: (reason: unknown) => void) => {
            if (result instanceof Error) {
              reject(result);
            } else {
              resolve(result);
            }
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

  return { calls, service: { db: chain as Database } as DatabaseService };
};

const uniqueViolation = Object.assign(new Error('duplicada'), { code: '23505' });

const viewRow = {
  id: 'm-1',
  status: 'ACTIVE',
  version: 1,
  personId: 'p-1',
  fullName: 'Maria da Silva',
  birthDate: null,
  phone: '67992550858',
  email: 'maria@exemplo.com',
};

const view = {
  id: 'm-1',
  status: 'ACTIVE',
  version: 1,
  person: {
    id: 'p-1',
    fullName: 'Maria da Silva',
    birthDate: null,
    phone: '67992550858',
    email: 'maria@exemplo.com',
  },
};

const person = () => {
  const name = PersonName.create('Maria da Silva');

  if (!name.ok) {
    throw new Error('Nome de teste inválido.');
  }

  return Person.register('p-1', 'a-1', {
    fullName: name.value,
    birthDate: null,
    phone: null,
    email: null,
  });
};

describe('DrizzleMemberRepository', () => {
  it('deve reconstituir o membro e gravar a situação com controle otimista', async () => {
    const { calls, service } = createDatabase([
      [{ id: 'm-1', personId: 'p-1', status: 'ACTIVE', version: 1 }],
      [],
      [{ version: 2 }],
      [],
    ]);

    const repository = new DrizzleMemberRepository(service);

    const member = await repository.findById('m-1');

    expect(member?.toSnapshot()).toEqual({
      id: 'm-1',
      personId: 'p-1',
      status: 'ACTIVE',
      version: 1,
    });

    await expect(repository.findById('m-9')).resolves.toBeNull();

    await expect(repository.update(Member.enroll('m-1', 'p-1'))).resolves.toBe(2);

    await expect(repository.update(Member.enroll('m-1', 'p-1'))).resolves.toBeNull();

    expect(calls.find(({ method }) => method === 'set')?.args[0]).toMatchObject({
      status: 'ACTIVE',
    });
  });

  it('deve gravar Pessoa e membro juntos e traduzir a conta já usada', async () => {
    const { calls, service } = createDatabase([[], [], uniqueViolation, new Error('rede')]);

    const repository = new DrizzleMemberRepository(service);

    await expect(repository.enroll(person(), Member.enroll('m-1', 'p-1'))).resolves.toBe(
      'enrolled',
    );

    expect(calls.filter(({ method }) => method === 'values').map(({ args }) => args[0])).toEqual([
      expect.objectContaining({ id: 'p-1', accountId: 'a-1' }),
      expect.objectContaining({ id: 'm-1', personId: 'p-1' }),
    ]);

    await expect(repository.enroll(person(), Member.enroll('m-2', 'p-1'))).resolves.toBe(
      'account_taken',
    );

    await expect(repository.enroll(person(), Member.enroll('m-3', 'p-1'))).rejects.toThrow('rede');
  });
});

describe('DrizzleMemberQueries', () => {
  it('deve devolver o membro com a Pessoa por ID e pela conta de origem', async () => {
    const { calls, service } = createDatabase([[viewRow], [viewRow], []]);

    const queries = new DrizzleMemberQueries(service);

    await expect(queries.findById('m-1')).resolves.toEqual(view);

    await expect(queries.findByAccountId('a-1')).resolves.toEqual(view);

    await expect(queries.findById('m-9')).resolves.toBeNull();

    expect(calls.filter(({ method }) => method === 'innerJoin')).toHaveLength(3);
  });

  it('deve listar aplicando situação, nome, congregação e cursor', async () => {
    const { calls, service } = createDatabase([[viewRow]]);

    const queries = new DrizzleMemberQueries(service);

    await expect(
      queries.list({
        status: 'ACTIVE',
        search: '50%_maria',
        congregationId: 'c-1',
        after: 'm-0',
        limit: 21,
      }),
    ).resolves.toEqual([view]);

    expect(calls.find(({ method }) => method === 'limit')?.args).toEqual([21]);
  });
});

const membership = () =>
  Membership.register({ id: 'v-1', memberId: 'm-1', congregationId: 'c-1', primary: true });

describe('DrizzleMembershipRepository', () => {
  it('deve inserir, detectar duplicidade e vínculo principal já ativo', async () => {
    const { service } = createDatabase([
      [],
      uniqueViolation,
      [{ version: 2 }],
      uniqueViolation,
      [{ id: 'v-1' }],
      [],
    ]);

    const repository = new DrizzleMembershipRepository(service);

    await expect(repository.insert(membership())).resolves.toBe('inserted');

    await expect(repository.insert(membership())).resolves.toBe('duplicate');

    await expect(repository.update(membership())).resolves.toBe(2);

    await expect(repository.update(membership())).resolves.toBe('primary_taken');

    await expect(repository.hasOpenMemberships('m-1')).resolves.toBe(true);

    await expect(repository.hasOpenMemberships('m-2')).resolves.toBe(false);
  });

  it('deve reconstituir vínculos por ID e por membro', async () => {
    const row = {
      id: 'v-1',
      memberId: 'm-1',
      congregationId: 'c-1',
      primary: true,
      status: 'PENDING',
      startedOn: null,
      endedOn: null,
      version: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const { service } = createDatabase([[row], [], [row]]);

    const repository = new DrizzleMembershipRepository(service);

    expect((await repository.findById('v-1'))?.toSnapshot()).toMatchObject({ id: 'v-1' });

    await expect(repository.findById('v-9')).resolves.toBeNull();

    await expect(repository.listByMember('m-1')).resolves.toEqual([
      expect.objectContaining({ id: 'v-1', status: 'PENDING' }),
    ]);
  });
});
