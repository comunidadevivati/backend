import { sql } from 'drizzle-orm';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  app,
  connection,
  getMe,
  login,
  PASSWORD,
  sentEmailVerificationEmails,
  sessionCookieOf,
  verifyEmail,
} from './support/auth-test-context.js';

interface Account {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  status: string;
  emailVerified: boolean;
  createdAt: string;
  suspendedAt: string | null;
}

interface Operator {
  cookie: string;
  csrfToken: string;
}

const newUser = {
  name: 'Paula Ribeiro',
  phone: '67991112233',
  email: 'paula.ribeiro@exemplo.com',
  password: 'Diversos@@2026',
};

let operator: Operator;

let operatorId: string;

type Method = 'GET' | 'POST' | 'PATCH' | 'DELETE';

const call = (method: Method, url: string, payload?: object, as: Operator = operator) =>
  app.inject({
    method,
    url: `/api/v1/users${url}`,
    headers: { cookie: as.cookie, 'x-csrf-token': as.csrfToken },
    ...(payload ? { payload } : {}),
  });

const signIn = async (email: string): Promise<Operator> => {
  const response = await login(email, PASSWORD);

  return { cookie: sessionCookieOf(response), csrfToken: response.json<Operator>().csrfToken };
};

beforeAll(async () => {
  // Quem opera a gestão precisa de e-mail verificado.
  await connection.db.execute(
    sql`update auth.users set email_verified_at = now() where email = 'membro@exemplo.com'`,
  );

  operator = await signIn('membro@exemplo.com');

  const { rows } = await connection.pool.query<{ id: string }>(
    `select id from auth.users where email = 'membro@exemplo.com'`,
  );

  operatorId = rows[0]?.id ?? '';
});

describe('Gestão de usuários (PostgreSQL real)', () => {
  it('deve exigir sessão, e-mail verificado e CSRF', async () => {
    const anonymous = await app.inject({ method: 'GET', url: '/api/v1/users' });

    expect(anonymous.statusCode).toBe(401);

    const unverified = await call('GET', '', undefined, await signIn('recuperacao@exemplo.com'));

    expect(unverified.statusCode).toBe(403);

    const withoutCsrf = await call('POST', '', newUser, { ...operator, csrfToken: 'invalido' });

    expect(withoutCsrf.statusCode).toBe(403);
  });

  it('deve cadastrar como na tela de login, sem trocar a sessão de quem cadastra', async () => {
    const created = await call('POST', '', newUser);

    expect(created.statusCode).toBe(201);

    expect(created.cookies).toEqual([]);

    expect(created.json()).toMatchObject({
      name: 'Paula Ribeiro',
      email: 'paula.ribeiro@exemplo.com',
      phone: '67991112233',
      status: 'ACTIVE',
      emailVerified: false,
    });

    expect(created.json()).not.toHaveProperty('passwordHash');

    expect(sentEmailVerificationEmails.at(-1)).toMatchObject({ email: newUser.email });

    const me = await getMe(operator.cookie);

    expect(me.json()).toMatchObject({ user: { email: 'membro@exemplo.com' } });

    const duplicate = await call('POST', '', newUser);

    expect(duplicate.statusCode).toBe(409);

    expect(duplicate.json()).toMatchObject({ code: 'email_taken' });

    const invalid = await call('POST', '', { ...newUser, email: 'x', password: '123' });

    expect(invalid.statusCode).toBe(400);

    expect(invalid.json()).toMatchObject({ fields: ['email', 'password'] });
  });

  it('deve listar com busca por nome ou e-mail e consultar por ID', async () => {
    const page = await call('GET', '?search=RIBEIRO');

    const [found] = page.json<{ items: Account[] }>().items;

    expect(found?.email).toBe(newUser.email);

    const byEmail = await call('GET', '?search=paula.ribeiro@');

    expect(byEmail.json<{ items: Account[] }>().items).toHaveLength(1);

    // Filtros combinados: situação e verificação do e-mail.
    const activeUnverified = await call('GET', '?status=ACTIVE&emailVerified=false');

    const unverifiedItems = activeUnverified.json<{ items: Account[] }>().items;

    expect(unverifiedItems.map(({ email }) => email)).toContain(newUser.email);

    expect(unverifiedItems.every((item) => item.status === 'ACTIVE' && !item.emailVerified)).toBe(
      true,
    );

    const verified = await call('GET', '?emailVerified=true');

    const verifiedEmails = verified.json<{ items: Account[] }>().items.map(({ email }) => email);

    expect(verifiedEmails).toContain('membro@exemplo.com');

    expect(verifiedEmails).not.toContain(newUser.email);

    expect((await call('GET', '?emailVerified=sim')).statusCode).toBe(400);

    expect((await call('GET', `/${found?.id ?? ''}`)).json()).toMatchObject({ id: found?.id });

    expect((await call('GET', '/nao-e-uuid')).statusCode).toBe(404);
  });

  it('deve revalidar o e-mail alterado e invalidar o link enviado ao endereço anterior', async () => {
    const created = await call('POST', '', { ...newUser, email: 'troca@exemplo.com' });

    const { id } = created.json<Account>();

    const oldLink = sentEmailVerificationEmails.at(-1)?.token ?? '';

    const renamed = await call('PATCH', `/${id}`, { name: 'Paula Souza', phone: '6732221100' });

    expect(renamed.json()).toMatchObject({ name: 'Paula Souza', phone: '6732221100' });

    const changed = await call('PATCH', `/${id}`, { email: 'Novo.Endereco@Exemplo.com' });

    expect(changed.json()).toMatchObject({
      email: 'novo.endereco@exemplo.com',
      emailVerified: false,
    });

    expect(sentEmailVerificationEmails.at(-1)).toMatchObject({
      email: 'novo.endereco@exemplo.com',
    });

    expect((await verifyEmail(oldLink)).statusCode).toBe(400);

    const newLink = sentEmailVerificationEmails.at(-1)?.token ?? '';

    expect((await verifyEmail(newLink)).statusCode).toBe(200);

    const taken = await call('PATCH', `/${id}`, { email: 'membro@exemplo.com' });

    expect(taken.statusCode).toBe(409);
  });

  it('deve suspender (bloqueando o login) e reativar, mas nunca a própria conta', async () => {
    const created = await call('POST', '', { ...newUser, email: 'suspender@exemplo.com' });

    const { id } = created.json<Account>();

    await connection.db.execute(
      sql`update auth.users set password_hash = (select password_hash from auth.users where email = 'membro@exemplo.com') where id = ${id}`,
    );

    const target = await signIn('suspender@exemplo.com');

    const suspended = await call('POST', `/${id}/suspend`);

    expect(suspended.json()).toMatchObject({ status: 'SUSPENDED' });

    const { suspendedAt } = suspended.json<Account>();

    expect(suspendedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/u);

    // Repetir a suspensão preserva o momento original.
    expect((await call('POST', `/${id}/suspend`)).json()).toMatchObject({ suspendedAt });

    // A sessão aberta é encerrada e um novo login é recusado.
    expect((await getMe(target.cookie)).statusCode).toBe(401);

    expect((await login('suspender@exemplo.com', PASSWORD)).statusCode).toBe(401);

    const reactivated = await call('POST', `/${id}/reactivate`);

    expect(reactivated.json()).toMatchObject({ status: 'ACTIVE', suspendedAt: null });

    const selfSuspend = await call('POST', `/${operatorId}/suspend`);

    expect(selfSuspend.json()).toMatchObject({ statusCode: 409, code: 'self_action' });

    expect((await call('DELETE', `/${operatorId}`)).statusCode).toBe(409);
  });

  it('deve excluir definitivamente somente contas com e-mail não verificado', async () => {
    const created = await call('POST', '', { ...newUser, email: 'abandonada@exemplo.com' });

    const { id } = created.json<Account>();

    const deleted = await call('DELETE', `/${id}`);

    expect(deleted.statusCode).toBe(204);

    expect((await call('GET', `/${id}`)).statusCode).toBe(404);

    expect((await call('DELETE', `/${id}`)).statusCode).toBe(404);

    const verified = await call('GET', '?search=novo.endereco');

    const [account] = verified.json<{ items: Account[] }>().items;

    const refused = await call('DELETE', `/${account?.id ?? ''}`);

    expect(refused.statusCode).toBe(409);

    // Conta verificada não é excluída, mas pode ser suspensa.
    const suspended = await call('POST', `/${account?.id ?? ''}/suspend`);

    expect(suspended.json()).toMatchObject({ status: 'SUSPENDED', emailVerified: true });
  });
});
