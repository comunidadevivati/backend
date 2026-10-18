import { describe, expect, it, vi } from 'vitest';
import { hashPassword } from '../infrastructure/password/password-hasher.js';
import { ResetPasswordUseCase } from './reset-password.use-case.js';
import type { PasswordResetTokenRepository } from '../infrastructure/password-reset/password-reset-token.repository.js';
import type { SessionService } from '../infrastructure/session/session.service.js';

const TOKEN = 'a'.repeat(43);

const CURRENT_PASSWORD = 'Atual#Segura2026';

const NEW_PASSWORD = 'Nova#Segura2027';

const createFixture = async (hasUser = true) => {
  const passwordHash = await hashPassword(CURRENT_PASSWORD);

  const findValidUser = vi.fn(() =>
    Promise.resolve(
      hasUser
        ? {
            id: 'usuario-1',
            email: 'pessoa@exemplo.com',
            name: 'Pessoa Exemplo',
            passwordHash,
            emailVerifiedAt: null,
          }
        : null,
    ),
  );

  const consume = vi.fn(() => Promise.resolve(true));

  const createSession = vi.fn(() =>
    Promise.resolve({ token: 'token-da-nova-sessao', csrfToken: 'csrf-da-nova-sessao' }),
  );

  const useCase = new ResetPasswordUseCase(
    { findValidUser, consume } as unknown as PasswordResetTokenRepository,
    { createSession } as unknown as SessionService,
  );

  return { consume, createSession, useCase };
};

describe('ResetPasswordUseCase', () => {
  it('deve trocar uma senha forte usando token válido e abrir uma nova sessão', async () => {
    const { consume, createSession, useCase } = await createFixture();

    await expect(useCase.execute({ token: TOKEN, password: NEW_PASSWORD })).resolves.toEqual({
      status: 'reset',
      session: {
        sessionToken: 'token-da-nova-sessao',
        csrfToken: 'csrf-da-nova-sessao',
        user: {
          id: 'usuario-1',
          email: 'pessoa@exemplo.com',
          name: 'Pessoa Exemplo',
          emailVerified: false,
        },
      },
    });

    expect(consume).toHaveBeenCalledWith(TOKEN, 'usuario-1', expect.stringMatching(/^scrypt\$/u));

    expect(createSession).toHaveBeenCalledWith('usuario-1');
  });

  it('deve recusar token inválido ou consumido concorrentemente sem abrir sessão', async () => {
    const missing = await createFixture(false);

    await expect(
      missing.useCase.execute({ token: TOKEN, password: NEW_PASSWORD }),
    ).resolves.toEqual({ status: 'invalid_token' });

    const concurrent = await createFixture();

    concurrent.consume.mockResolvedValueOnce(false);

    await expect(
      concurrent.useCase.execute({ token: TOKEN, password: NEW_PASSWORD }),
    ).resolves.toEqual({ status: 'invalid_token' });

    expect(concurrent.createSession).not.toHaveBeenCalled();
  });

  it.each([CURRENT_PASSWORD, 'Pessoa#Segura2027'])(
    'deve recusar senha insegura: %s',
    async (password) => {
      const { consume, useCase } = await createFixture();

      await expect(useCase.execute({ token: TOKEN, password })).resolves.toEqual({
        status: 'weak_password',
      });

      expect(consume).not.toHaveBeenCalled();
    },
  );
});
