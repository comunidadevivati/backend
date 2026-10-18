import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { EmailVerificationController } from './email-verification.controller.js';
import type {
  SendEmailVerificationResult,
  SendEmailVerificationUseCase,
} from '../application/send-email-verification.use-case.js';
import type {
  VerifyEmailResult,
  VerifyEmailUseCase,
} from '../application/verify-email.use-case.js';
import type { SessionCookieService } from './session-cookie.service.js';
import type { FastifyRequest } from 'fastify';

const TOKEN = 'a'.repeat(43);

const session = {
  userId: 'usuario-1',
  email: 'pessoa@exemplo.com',
  name: 'Pessoa Exemplo',
  emailVerified: false,
  csrfToken: 'csrf',
};

const request = {} as FastifyRequest;

interface FixtureOptions {
  verifyResult?: VerifyEmailResult;
  sendResult?: SendEmailVerificationResult | Error;
  csrfError?: Error;
}

const createFixture = ({
  verifyResult = 'verified',
  sendResult = 'sent',
  csrfError,
}: FixtureOptions = {}) => {
  const verify = vi.fn(() => Promise.resolve(verifyResult));

  const send = vi.fn(() =>
    sendResult instanceof Error ? Promise.reject(sendResult) : Promise.resolve(sendResult),
  );

  const assertCsrfToken = vi.fn(() => {
    if (csrfError) {
      throw csrfError;
    }
  });

  const controller = new EmailVerificationController(
    { execute: verify } as unknown as VerifyEmailUseCase,
    { execute: send } as unknown as SendEmailVerificationUseCase,
    {
      requireSession: vi.fn(() => Promise.resolve({ session })),
      assertCsrfToken,
    } as unknown as SessionCookieService,
  );

  return { controller, send, verify };
};

describe('EmailVerificationController — verificação', () => {
  it('deve confirmar o e-mail com token válido', async () => {
    const { controller, verify } = createFixture();

    await expect(controller.verify({ token: TOKEN })).resolves.toEqual({
      message: 'E-mail verificado com sucesso.',
    });

    expect(verify).toHaveBeenCalledWith(TOKEN);
  });

  it.each([{ token: 'curto' }, undefined])('deve recusar corpo inválido %#', async (body) => {
    const { controller, verify } = createFixture();

    await expect(controller.verify(body)).rejects.toThrow(
      new BadRequestException('Link de verificação inválido ou expirado.'),
    );

    expect(verify).not.toHaveBeenCalled();
  });

  it('deve recusar token inválido ou expirado', async () => {
    const { controller } = createFixture({ verifyResult: 'invalid_token' });

    await expect(controller.verify({ token: TOKEN })).rejects.toThrow(BadRequestException);
  });
});

describe('EmailVerificationController — reenvio', () => {
  it('deve reenviar para o e-mail da sessão', async () => {
    const { controller, send } = createFixture();

    await expect(controller.resend(request)).resolves.toEqual({
      message: 'Enviamos um novo link de verificação para pessoa@exemplo.com.',
    });

    expect(send).toHaveBeenCalledWith({
      userId: 'usuario-1',
      email: 'pessoa@exemplo.com',
      name: 'Pessoa Exemplo',
    });
  });

  it('deve exigir o token CSRF antes de enviar', async () => {
    const { controller, send } = createFixture({ csrfError: new ForbiddenException() });

    await expect(controller.resend(request)).rejects.toThrow(ForbiddenException);

    expect(send).not.toHaveBeenCalled();
  });

  it('deve responder 409 quando o e-mail já estiver verificado', async () => {
    const { controller } = createFixture({ sendResult: 'already_verified' });

    await expect(controller.resend(request)).rejects.toThrow(
      new ConflictException('Este e-mail já foi verificado.'),
    );
  });

  it('deve responder 429 durante o intervalo entre envios', async () => {
    const { controller } = createFixture({ sendResult: 'cooldown' });

    await expect(controller.resend(request)).rejects.toMatchObject(
      new HttpException('Aguarde alguns instantes antes de solicitar um novo e-mail.', 429),
    );
  });

  it('deve responder 503 quando o provedor de e-mail falhar', async () => {
    const { controller } = createFixture({ sendResult: new Error('Resend indisponível') });

    await expect(controller.resend(request)).rejects.toThrow(ServiceUnavailableException);
  });
});
