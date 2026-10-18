import { BadRequestException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { PasswordRecoveryController } from './password-recovery.controller.js';
import type { RequestPasswordRecoveryUseCase } from '../application/request-password-recovery.use-case.js';
import type {
  ResetPasswordResult,
  ResetPasswordUseCase,
} from '../application/reset-password.use-case.js';
import type { SessionCookieService } from './session-cookie.service.js';
import type { FastifyReply, FastifyRequest } from 'fastify';

const GENERIC_MESSAGE = 'Se existir uma conta para este e-mail, enviaremos as instruções.';

const TOKEN = 'a'.repeat(43);

const session = {
  sessionToken: 'token-da-nova-sessao',
  csrfToken: 'csrf-da-nova-sessao',
  user: { id: 'usuario-1', email: 'pessoa@exemplo.com', name: 'Pessoa Exemplo' },
};

const startedSession = {
  authenticated: true,
  message: 'Senha redefinida com sucesso.',
  csrfToken: 'csrf-da-nova-sessao',
  user: { subject: 'usuario-1', email: 'pessoa@exemplo.com', name: 'Pessoa Exemplo' },
};

const request = {} as FastifyRequest;

const reply = {} as FastifyReply;

const createFixture = (resetResult: ResetPasswordResult = { status: 'reset', session }) => {
  const requestRecovery = vi.fn(() => Promise.resolve());

  const resetPassword = vi.fn(() => Promise.resolve(resetResult));

  const startSession = vi.fn(() => Promise.resolve(startedSession));

  const controller = new PasswordRecoveryController(
    { execute: requestRecovery } as unknown as RequestPasswordRecoveryUseCase,
    { execute: resetPassword } as unknown as ResetPasswordUseCase,
    { startSession } as unknown as SessionCookieService,
  );

  return { controller, requestRecovery, resetPassword, startSession };
};

describe('PasswordRecoveryController', () => {
  it.each([undefined, {}, { email: '' }, { email: 'nao-e-email' }])(
    'deve responder genericamente para e-mail inválido %#',
    async (body) => {
      const { controller, requestRecovery } = createFixture();

      await expect(controller.request(body)).resolves.toEqual({ message: GENERIC_MESSAGE });

      expect(requestRecovery).not.toHaveBeenCalled();
    },
  );

  it('deve normalizar a solicitação sem revelar se a conta existe', async () => {
    const { controller, requestRecovery } = createFixture();

    await expect(controller.request({ email: ' Pessoa@Exemplo.com ' })).resolves.toEqual({
      message: GENERIC_MESSAGE,
    });

    expect(requestRecovery).toHaveBeenCalledWith({ email: 'pessoa@exemplo.com' });
  });

  it('deve redefinir uma senha com token válido e abrir uma nova sessão', async () => {
    const { controller, resetPassword, startSession } = createFixture();

    await expect(
      controller.reset({ token: TOKEN, password: 'Nova!Senha#2026' }, request, reply),
    ).resolves.toEqual(startedSession);

    expect(resetPassword).toHaveBeenCalledWith({ token: TOKEN, password: 'Nova!Senha#2026' });

    expect(startSession).toHaveBeenCalledWith(
      request,
      reply,
      session,
      'Senha redefinida com sucesso.',
    );
  });

  it.each([
    ['invalid_token', 'Link de recuperação inválido ou expirado.'],
    ['weak_password', 'A nova senha não atende aos requisitos de segurança.'],
  ] as const)('deve recusar redefinição com resultado %s', async (result, message) => {
    const { controller, startSession } = createFixture({ status: result });

    await expect(
      controller.reset({ token: TOKEN, password: 'Nova!Senha#2026' }, request, reply),
    ).rejects.toThrow(new BadRequestException(message));

    expect(startSession).not.toHaveBeenCalled();
  });

  it('deve recusar corpo inválido na redefinição', async () => {
    const { controller, resetPassword } = createFixture();

    await expect(
      controller.reset({ token: 'invalido', password: '' }, request, reply),
    ).rejects.toThrow(new BadRequestException('Link ou nova senha inválidos.'));

    expect(resetPassword).not.toHaveBeenCalled();
  });
});
