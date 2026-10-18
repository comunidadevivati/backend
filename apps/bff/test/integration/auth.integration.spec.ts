import { describe, expect, it } from 'vitest';
import {
  connection,
  getMe,
  login,
  logout,
  PASSWORD,
  requestPasswordRecovery,
  resetPassword,
  sentPasswordRecoveryEmails,
  sessionCookieOf,
  sessionTokenOf,
  sha256,
} from './support/auth-test-context.js';

describe('POST /auth/password-recovery (PostgreSQL real)', () => {
  it('deve emitir token com hash persistido para e-mail existente', async () => {
    const response = await requestPasswordRecovery('  MEMBRO@exemplo.com ');

    expect(response.statusCode).toBe(200);

    expect(response.headers['cache-control']).toBe('no-store');

    expect(response.json()).toEqual({
      message: 'Se existir uma conta para este e-mail, enviaremos as instruções.',
    });

    const sentEmail = sentPasswordRecoveryEmails.at(-1);

    expect(sentEmail).toMatchObject({
      email: 'membro@exemplo.com',
      name: 'Membro Ativo',
      ttlMinutes: 15,
    });

    const { rows } = await connection.pool.query<{ token_hash: string; valid: boolean }>(
      `select token_hash, expires_at > now() as valid
       from auth.password_reset_tokens
       where user_id = (select id from auth.users where email = 'membro@exemplo.com')`,
    );

    expect(rows).toEqual([{ token_hash: sha256(sentEmail?.token ?? ''), valid: true }]);
  });

  it.each(['nao-e-email', 'ninguem@exemplo.com'])(
    'deve usar resposta genérica para e-mail inválido ou inexistente: %s',
    async (email) => {
      const sentBefore = sentPasswordRecoveryEmails.length;

      const response = await requestPasswordRecovery(email);

      expect(response.statusCode).toBe(200);

      expect(response.json()).toEqual({
        message: 'Se existir uma conta para este e-mail, enviaremos as instruções.',
      });

      expect(sentPasswordRecoveryEmails).toHaveLength(sentBefore);
    },
  );

  it('deve invalidar o link anterior ao solicitar outro', async () => {
    await requestPasswordRecovery('membro@exemplo.com');

    const previousToken = sentPasswordRecoveryEmails.at(-1)?.token ?? '';

    await requestPasswordRecovery('membro@exemplo.com');

    expect((await resetPassword(previousToken, 'Outra#Senha2028')).statusCode).toBe(400);
  });
});

describe('POST /auth/password-reset (PostgreSQL real)', () => {
  it('deve trocar a senha, consumir o token, revogar as sessões e abrir uma nova', async () => {
    const oldSession = sessionCookieOf(await login('recuperacao@exemplo.com', PASSWORD));

    await requestPasswordRecovery('recuperacao@exemplo.com');

    const token = sentPasswordRecoveryEmails.at(-1)?.token ?? '';

    const response = await resetPassword(token, 'N0vo#Acesso2027');

    expect(response.statusCode).toBe(200);

    expect(response.json()).toMatchObject({
      authenticated: true,
      message: 'Senha redefinida com sucesso.',
      user: { email: 'recuperacao@exemplo.com' },
    });

    expect((await getMe(oldSession)).statusCode).toBe(401);

    expect((await getMe(sessionCookieOf(response))).statusCode).toBe(200);

    expect((await login('recuperacao@exemplo.com', PASSWORD)).statusCode).toBe(401);

    expect((await login('recuperacao@exemplo.com', 'N0vo#Acesso2027')).statusCode).toBe(200);

    expect((await resetPassword(token, 'Terceira#Senha2028')).statusCode).toBe(400);
  });

  it('deve recusar token expirado, conta suspensa e senha fraca', async () => {
    await requestPasswordRecovery('membro@exemplo.com');

    const expiredToken = sentPasswordRecoveryEmails.at(-1)?.token ?? '';

    await connection.pool.query(
      "update auth.password_reset_tokens set expires_at = now() - interval '1 second' where token_hash = $1",
      [sha256(expiredToken)],
    );

    expect((await resetPassword(expiredToken, 'Outra#Senha2028')).statusCode).toBe(400);

    await requestPasswordRecovery('suspenso@exemplo.com');

    expect(sentPasswordRecoveryEmails.at(-1)?.token).toBe(expiredToken);

    await requestPasswordRecovery('membro@exemplo.com');

    const validToken = sentPasswordRecoveryEmails.at(-1)?.token ?? '';

    expect((await resetPassword(validToken, 'senha')).statusCode).toBe(400);
  });
});

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
