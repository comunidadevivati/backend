import { describe, expect, it, vi } from 'vitest';
import { hashPassword } from '../infrastructure/password/password-hasher.js';
import { ResetPasswordUseCase } from './reset-password.use-case.js';
import type { PasswordResetTokenRepository } from '../infrastructure/password-reset/password-reset-token.repository.js';

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
          }
        : null,
    ),
  );

  const consume = vi.fn(() => Promise.resolve(true));

  const useCase = new ResetPasswordUseCase({
    findValidUser,
    consume,
  } as unknown as PasswordResetTokenRepository);

  return { consume, useCase };
};

describe('ResetPasswordUseCase', () => {
  it('deve trocar uma senha forte usando token válido', async () => {
    const { consume, useCase } = await createFixture();

    await expect(useCase.execute({ token: TOKEN, password: NEW_PASSWORD })).resolves.toBe('reset');

    expect(consume).toHaveBeenCalledWith(TOKEN, 'usuario-1', expect.stringMatching(/^scrypt\$/u));
  });

  it('deve recusar token inválido ou consumido concorrentemente', async () => {
    const missing = await createFixture(false);

    await expect(missing.useCase.execute({ token: TOKEN, password: NEW_PASSWORD })).resolves.toBe(
      'invalid_token',
    );

    const concurrent = await createFixture();

    concurrent.consume.mockResolvedValueOnce(false);

    await expect(
      concurrent.useCase.execute({ token: TOKEN, password: NEW_PASSWORD }),
    ).resolves.toBe('invalid_token');
  });

  it.each([CURRENT_PASSWORD, 'Pessoa#Segura2027'])(
    'deve recusar senha insegura: %s',
    async (password) => {
      const { consume, useCase } = await createFixture();

      await expect(useCase.execute({ token: TOKEN, password })).resolves.toBe('weak_password');

      expect(consume).not.toHaveBeenCalled();
    },
  );
});
