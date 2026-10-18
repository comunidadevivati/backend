import { BadRequestException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { PasswordRecoveryController } from './password-recovery.controller.js';
import type { RequestPasswordRecoveryUseCase } from '../application/request-password-recovery.use-case.js';
import type {
  ResetPasswordResult,
  ResetPasswordUseCase,
} from '../application/reset-password.use-case.js';

const GENERIC_MESSAGE = 'Se existir uma conta para este e-mail, enviaremos as instruções.';

const TOKEN = 'a'.repeat(43);

const createFixture = (resetResult: ResetPasswordResult = 'reset') => {
  const requestRecovery = vi.fn(() => Promise.resolve());

  const resetPassword = vi.fn(() => Promise.resolve(resetResult));

  const controller = new PasswordRecoveryController(
    { execute: requestRecovery } as unknown as RequestPasswordRecoveryUseCase,
    { execute: resetPassword } as unknown as ResetPasswordUseCase,
  );

  return { controller, requestRecovery, resetPassword };
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

  it('deve redefinir uma senha com token válido', async () => {
    const { controller, resetPassword } = createFixture();

    await expect(controller.reset({ token: TOKEN, password: 'Nova!Senha#2026' })).resolves.toEqual({
      message: 'Senha redefinida com sucesso. Faça login novamente.',
    });

    expect(resetPassword).toHaveBeenCalledWith({ token: TOKEN, password: 'Nova!Senha#2026' });
  });

  it.each([
    ['invalid_token', 'Link de recuperação inválido ou expirado.'],
    ['weak_password', 'A nova senha não atende aos requisitos de segurança.'],
  ] as const)('deve recusar redefinição com resultado %s', async (result, message) => {
    const { controller } = createFixture(result);

    await expect(controller.reset({ token: TOKEN, password: 'Nova!Senha#2026' })).rejects.toThrow(
      new BadRequestException(message),
    );
  });

  it('deve recusar corpo inválido na redefinição', async () => {
    const { controller, resetPassword } = createFixture();

    await expect(controller.reset({ token: 'invalido', password: '' })).rejects.toThrow(
      new BadRequestException('Link ou nova senha inválidos.'),
    );

    expect(resetPassword).not.toHaveBeenCalled();
  });
});
