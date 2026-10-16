import { describe, expect, it } from 'vitest';
import {
  connection,
  getMe,
  login,
  logout,
  PASSWORD,
  sessionCookieOf,
  sessionTokenOf,
  sha256,
} from './support/auth-test-context.js';

describe('POST /auth/login (PostgreSQL real)', () => {
  it('deve recusar senha incorreta e e-mail inexistente com a mesma resposta', async () => {
    const wrongPassword = await login('membro@exemplo.com', 'senha-errada');

    const unknownEmail = await login('ninguem@exemplo.com', PASSWORD);

    expect(wrongPassword.statusCode).toBe(401);

    expect(unknownEmail.statusCode).toBe(401);

    expect(wrongPassword.json()).toEqual(unknownEmail.json());

    expect(wrongPassword.cookies).toHaveLength(0);
  });

  it('deve recusar usuários suspensos', async () => {
    expect((await login('suspenso@exemplo.com', PASSWORD)).statusCode).toBe(401);
  });

  it('deve recusar corpo inválido', async () => {
    expect((await login('nao-e-email', PASSWORD)).statusCode).toBe(400);
  });

  it('deve autenticar com e-mail normalizado e emitir cookie HttpOnly', async () => {
    const response = await login('  MEMBRO@exemplo.com ', PASSWORD);

    expect(response.statusCode).toBe(200);

    expect(response.headers['cache-control']).toBe('no-store');

    expect(response.json()).toEqual({
      authenticated: true,
      message: 'Usuário autenticado com sucesso.',
      csrfToken: expect.stringMatching(/^[\w-]{43}$/u),
      user: {
        subject: expect.stringMatching(/^[\da-f-]{36}$/u),
        email: 'membro@exemplo.com',
        name: 'Membro Ativo',
      },
    });

    const setCookie = String(response.headers['set-cookie']);

    expect(setCookie).toContain('HttpOnly');

    expect(setCookie).toContain('SameSite=Lax');
  });
});

describe('Sessões no PostgreSQL (PostgreSQL real)', () => {
  it('deve persistir somente o hash do token de sessão', async () => {
    const token = sessionTokenOf(await login('membro@exemplo.com', PASSWORD));

    const { rows } = await connection.pool.query<{ token_hash: string }>(
      'select token_hash from auth.sessions',
    );

    expect(rows.map(({ token_hash }) => token_hash)).toContain(sha256(token));

    expect(rows.map(({ token_hash }) => token_hash)).not.toContain(token);
  });

  it('deve revogar a sessão anterior ao autenticar novamente no mesmo navegador', async () => {
    const first = sessionCookieOf(await login('membro@exemplo.com', PASSWORD));

    expect((await login('membro@exemplo.com', PASSWORD, first)).statusCode).toBe(200);

    expect((await getMe(first)).statusCode).toBe(401);
  });
});

describe('GET /auth/me e POST /auth/logout (PostgreSQL real)', () => {
  it('deve expor a sessão em /auth/me e encerrá-la no logout com CSRF', async () => {
    const response = await login('membro@exemplo.com', PASSWORD);

    const sessionCookie = sessionCookieOf(response);

    const body = response.json<{ csrfToken: string; message: string }>();

    const me = await getMe(sessionCookie);

    expect(me.statusCode).toBe(200);

    // O /auth/me devolve a sessão sem a mensagem da operação (toEqual ignora campos undefined).
    expect(me.json()).toEqual({ ...body, message: undefined });

    expect((await logout(sessionCookie)).statusCode).toBe(403);

    const loggedOut = await logout(sessionCookie, body.csrfToken);

    expect(loggedOut.statusCode).toBe(200);

    expect(loggedOut.json()).toEqual({
      authenticated: false,
      message: 'O logout foi efetuado com sucesso.',
    });

    expect((await getMe(sessionCookie)).statusCode).toBe(401);
  });
});

describe('Expiração da sessão (PostgreSQL real)', () => {
  it('deve renovar a sessão por inatividade e recusá-la após expirar', async () => {
    const response = await login('membro@exemplo.com', PASSWORD);

    const sessionCookie = sessionCookieOf(response);

    const tokenHash = sha256(sessionTokenOf(response));

    const setExpiration = (interval: string) =>
      connection.pool.query(
        'update auth.sessions set expires_at = now() + $2::interval where token_hash = $1',
        [tokenHash, interval],
      );

    await setExpiration('1 minute');

    expect((await getMe(sessionCookie)).statusCode).toBe(200);

    const { rows } = await connection.pool.query<{ renewed: boolean }>(
      "select expires_at > now() + interval '29 minutes' as renewed from auth.sessions where token_hash = $1",
      [tokenHash],
    );

    expect(rows[0]?.renewed).toBe(true);

    await setExpiration('-1 second');

    expect((await getMe(sessionCookie)).statusCode).toBe(401);
  });
});
