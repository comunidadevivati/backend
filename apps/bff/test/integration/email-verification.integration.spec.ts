import { describe, expect, it } from 'vitest';
import {
  app,
  connection,
  getMe,
  resendEmailVerification,
  sentEmailVerificationEmails,
  sessionCookieOf,
  sha256,
  verifyEmail,
} from './support/auth-test-context.js';

const register = (email: string) =>
  app.inject({
    method: 'POST',
    url: '/auth/register',
    payload: { name: 'Lucas Andrade', phone: '67991234567', email, password: 'Diversos@@2026' },
  });

interface SessionBody {
  csrfToken: string;
  user: { emailVerified: boolean };
}

describe('Verificação de e-mail (PostgreSQL real)', () => {
  it('deve enviar o link no cadastro e verificar o e-mail uma única vez', async () => {
    const response = await register('lucas.andrade@exemplo.com');

    expect(response.json<SessionBody>().user.emailVerified).toBe(false);

    const sentEmail = sentEmailVerificationEmails.at(-1);

    expect(sentEmail).toMatchObject({
      email: 'lucas.andrade@exemplo.com',
      name: 'Lucas Andrade',
      ttlHours: 24,
    });

    const { rows } = await connection.pool.query<{ token_hash: string; ttl: boolean }>(
      `select token_hash, expires_at between now() + interval '23 hours' and now() + interval '25 hours' as ttl
       from auth.email_verification_tokens
       where user_id = (select id from auth.users where email = 'lucas.andrade@exemplo.com')`,
    );

    expect(rows).toEqual([{ token_hash: sha256(sentEmail?.token ?? ''), ttl: true }]);

    const verification = await verifyEmail(sentEmail?.token ?? '');

    expect(verification.statusCode).toBe(200);

    expect(verification.json()).toEqual({ message: 'E-mail verificado com sucesso.' });

    const me = await getMe(sessionCookieOf(response));

    expect(me.json<SessionBody>().user.emailVerified).toBe(true);

    expect((await verifyEmail(sentEmail?.token ?? '')).statusCode).toBe(400);
  });

  it('deve recusar token desconhecido ou malformado', async () => {
    expect((await verifyEmail('a'.repeat(43))).json()).toMatchObject({
      statusCode: 400,
      message: 'Link de verificação inválido ou expirado.',
    });

    expect((await verifyEmail('curto')).statusCode).toBe(400);
  });

  it('deve reenviar com sessão e CSRF, invalidando o link anterior', async () => {
    const response = await register('reenvio@exemplo.com');

    const sessionCookie = sessionCookieOf(response);

    const { csrfToken } = response.json<SessionBody>();

    const firstToken = sentEmailVerificationEmails.at(-1)?.token ?? '';

    expect((await resendEmailVerification(sessionCookie)).statusCode).toBe(403);

    const resend = await resendEmailVerification(sessionCookie, csrfToken);

    expect(resend.statusCode).toBe(200);

    expect(resend.json()).toEqual({
      message: 'Enviamos um novo link de verificação para reenvio@exemplo.com.',
    });

    const secondToken = sentEmailVerificationEmails.at(-1)?.token ?? '';

    expect(secondToken).not.toBe(firstToken);

    expect((await verifyEmail(firstToken)).statusCode).toBe(400);

    expect((await verifyEmail(secondToken)).statusCode).toBe(200);

    const alreadyVerified = await resendEmailVerification(sessionCookie, csrfToken);

    expect(alreadyVerified.statusCode).toBe(409);

    expect(alreadyVerified.json()).toMatchObject({ message: 'Este e-mail já foi verificado.' });
  });

  it('deve exigir sessão para reenviar', async () => {
    expect((await resendEmailVerification('comvivati_session=invalido')).statusCode).toBe(401);
  });
});
