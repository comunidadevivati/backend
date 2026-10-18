import { describe, expect, it } from 'vitest';
import { app, connection, getMe, login, sessionCookieOf } from './support/auth-test-context.js';

const register = (payload: Record<string, string>) =>
  app.inject({ method: 'POST', url: '/auth/register', payload });

const newAccount = {
  name: '  Joana   Pereira ',
  phone: '67991234567',
  email: ' Joana.Pereira@Exemplo.com ',
  password: 'Diversos@@2026',
};

describe('POST /auth/register (PostgreSQL real)', () => {
  it('deve criar a conta e já abrir a sessão, com a mesma resposta do login', async () => {
    const response = await register(newAccount);

    expect(response.statusCode).toBe(201);

    expect(response.headers['cache-control']).toBe('no-store');

    const body = response.json<{ csrfToken: string; message: string; user: { subject: string } }>();

    expect(body).toEqual({
      authenticated: true,
      message: 'Usuário cadastrado com sucesso.',
      csrfToken: expect.stringMatching(/^[\w-]{43}$/u),
      user: {
        subject: expect.stringMatching(/^[\da-f-]{36}$/u),
        email: 'joana.pereira@exemplo.com',
        name: 'Joana Pereira',
        emailVerified: false,
      },
    });

    expect(String(response.headers['set-cookie'])).toContain('HttpOnly');

    const me = await getMe(sessionCookieOf(response));

    expect(me.statusCode).toBe(200);

    // O /auth/me devolve a sessão sem a mensagem da operação (toEqual ignora campos undefined).
    expect(me.json()).toEqual({ ...body, message: undefined });

    const { rows } = await connection.pool.query<Record<string, string>>(
      "select name, phone, email, status, password_hash from auth.users where email = 'joana.pereira@exemplo.com'",
    );

    expect(rows[0]).toMatchObject({
      name: 'Joana Pereira',
      phone: '67991234567',
      status: 'ACTIVE',
      password_hash: expect.stringMatching(/^scrypt\$32768\$/u),
    });

    expect((await login('joana.pereira@exemplo.com', 'Diversos@@2026')).statusCode).toBe(200);
  });
});

describe('POST /auth/register recusado (PostgreSQL real)', () => {
  it('deve responder 409 para e-mail já cadastrado, sem diferenciar maiúsculas', async () => {
    const response = await register({ ...newAccount, email: 'MEMBRO@exemplo.com' });

    expect(response.statusCode).toBe(409);
  });

  it('deve responder 400 listando somente os campos recusados', async () => {
    const response = await register({ ...newAccount, phone: '123', password: 'fraca' });

    expect(response.statusCode).toBe(400);

    expect(response.json()).toMatchObject({ fields: ['phone', 'password'] });

    expect(response.body).not.toContain('fraca');
  });
});
