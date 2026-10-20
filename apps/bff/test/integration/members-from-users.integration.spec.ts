import { sql } from 'drizzle-orm';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  app,
  connection,
  login,
  PASSWORD,
  registeredMembers,
  sessionCookieOf,
} from './support/auth-test-context.js';

interface Account {
  id: string;
  personId: string | null;
}

interface MemberOutcome {
  userId: string;
  status: string;
  personId?: string;
}

interface Operator {
  cookie: string;
  csrfToken: string;
}

let operator: Operator;

const call = (method: 'GET' | 'POST', url: string, payload?: object, as: Operator = operator) =>
  app.inject({
    method,
    url: `/api/v1/users${url}`,
    headers: { cookie: as.cookie, 'x-csrf-token': as.csrfToken },
    ...(payload ? { payload } : {}),
  });

const accountIds = async (query: string) =>
  (await call('GET', query)).json<{ items: Account[] }>().items.map(({ id }) => id);

const convert = async (userIds: string[]) =>
  (await call('POST', '/members', { userIds })).json<{ items: MemberOutcome[] }>().items;

const createAccount = async (email: string, name: string, verified = true) => {
  const created = await call('POST', '', {
    name,
    phone: '67991112233',
    email,
    password: 'Diversos@@2026',
  });

  const { id } = created.json<Account>();

  if (verified) {
    await connection.db.execute(
      sql`update auth.users set email_verified_at = now() where id = ${id}`,
    );
  }

  return id;
};

beforeAll(async () => {
  await connection.db.execute(
    sql`update auth.users set email_verified_at = now() where email = 'membro@exemplo.com'`,
  );

  const response = await login('membro@exemplo.com', PASSWORD);

  operator = {
    cookie: sessionCookieOf(response),
    csrfToken: response.json<Operator>().csrfToken,
  };
});

describe('Conversão de contas em membros (PostgreSQL real)', () => {
  it('deve exigir CSRF e de 1 a 50 IDs no formato UUID', async () => {
    const withoutCsrf = await call(
      'POST',
      '/members',
      { userIds: ['01a14f8e-a000-7000-8000-000000000001'] },
      { ...operator, csrfToken: 'invalido' },
    );

    expect(withoutCsrf.statusCode).toBe(403);

    expect((await call('POST', '/members', { userIds: [] })).statusCode).toBe(400);

    expect((await call('POST', '/members', { userIds: ['x'] })).statusCode).toBe(400);
  });

  it('deve converter somente contas verificadas, com os dados da conta', async () => {
    const first = await createAccount('lucas.andrade@exemplo.com', 'Lucas Andrade');

    const second = await createAccount('rita.lima@exemplo.com', 'Rita Lima');

    const rejected = await createAccount('recusado@exemplo.com', 'Recusado Silva');

    const unverified = await createAccount('sem.verificacao@exemplo.com', 'Ana Souza', false);

    const missing = '01a14f8e-a000-7000-8000-000000000404';

    // Candidatas da tela "Criar membro": verificadas e ainda sem membro.
    const candidates = await accountIds('?emailVerified=true&hasPerson=false&limit=100');

    expect(candidates).toEqual(expect.arrayContaining([first, second, rejected]));

    expect(candidates).not.toContain(unverified);

    const items = await convert([first, second, unverified, rejected, missing]);

    expect(items.map(({ status, userId }) => [userId, status])).toEqual([
      [first, 'linked'],
      [second, 'linked'],
      [unverified, 'unverified'],
      [rejected, 'rejected'],
      [missing, 'not_found'],
    ]);

    expect(registeredMembers.find(({ id }) => id === items[0]?.personId)).toEqual({
      id: items[0]?.personId,
      accountId: first,
      fullName: 'Lucas Andrade',
      email: 'lucas.andrade@exemplo.com',
      phone: '67991112233',
    });

    expect((await call('GET', `/${first}`)).json()).toMatchObject({
      personId: items[0]?.personId,
    });

    // Convertidas saem da lista de candidatas; a recusada continua disponível.
    const remaining = await accountIds('?emailVerified=true&hasPerson=false&limit=100');

    expect(remaining).toContain(rejected);

    expect(remaining).not.toContain(first);

    expect(await accountIds('?hasPerson=true&limit=100')).toEqual(
      expect.arrayContaining([first, second]),
    );

    expect(await convert([first])).toEqual([
      { userId: first, status: 'already_linked', personId: items[0]?.personId },
    ]);
  });

  it('deve gerar um único membro para pedidos simultâneos da mesma conta', async () => {
    const id = await createAccount('joana.prado@exemplo.com', 'Joana Prado');

    const registeredBefore = registeredMembers.length;

    const results = await Promise.all([convert([id]), convert([id])]);

    expect(results.map(([outcome]) => outcome?.status).toSorted()).toEqual([
      'already_linked',
      'linked',
    ]);

    expect(registeredMembers).toHaveLength(registeredBefore + 1);
  });
});
