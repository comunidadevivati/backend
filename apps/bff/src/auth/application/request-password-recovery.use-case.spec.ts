import { describe, expect, it, vi } from 'vitest';
import { RequestPasswordRecoveryUseCase } from './request-password-recovery.use-case.js';
import type { PasswordResetTokenRepository } from '../infrastructure/password-reset/password-reset-token.repository.js';
import type { UserCredentials, UserRepository } from '../infrastructure/users/user.repository.js';
import type { PasswordRecoveryEmailSender } from './ports/password-recovery-email-sender.js';

const ACTIVE_USER: UserCredentials = {
  id: 'usuario-1',
  email: 'pessoa@exemplo.com',
  name: 'Pessoa Exemplo',
  passwordHash: 'scrypt$hash',
  status: 'ACTIVE',
};

const ISSUED_TOKEN = {
  id: 'token-1',
  token: 'token-original',
  ttlMinutes: 15,
};

const createFixture = (
  user: UserCredentials | null,
  issuedToken: { id: string; token: string; ttlMinutes: number } | null = ISSUED_TOKEN,
) => {
  const findByEmail = vi.fn(() => Promise.resolve(user));

  const issueForUser = vi.fn(() => Promise.resolve(issuedToken));

  const send = vi.fn(() => Promise.resolve());

  const useCase = new RequestPasswordRecoveryUseCase(
    { findByEmail } as unknown as UserRepository,
    { issueForUser } as unknown as PasswordResetTokenRepository,
    { send } as PasswordRecoveryEmailSender,
  );

  return { issueForUser, send, useCase };
};

describe('RequestPasswordRecoveryUseCase', () => {
  it('deve emitir token e enviar a recuperação para usuário ativo', async () => {
    const { issueForUser, send, useCase } = createFixture(ACTIVE_USER);

    await expect(useCase.execute({ email: 'Pessoa@Exemplo.com' })).resolves.toBeUndefined();

    expect(issueForUser).toHaveBeenCalledWith('usuario-1');

    expect(send).toHaveBeenCalledWith({
      email: 'pessoa@exemplo.com',
      name: 'Pessoa Exemplo',
      token: 'token-original',
      ttlMinutes: 15,
      idempotencyKey: 'password-recovery/token-1',
    });
  });

  it.each([null, { ...ACTIVE_USER, status: 'SUSPENDED' as const }])(
    'não deve emitir token para conta inexistente ou suspensa %#',
    async (user) => {
      const { issueForUser, send, useCase } = createFixture(user);

      await useCase.execute({ email: 'pessoa@exemplo.com' });

      expect(issueForUser).not.toHaveBeenCalled();

      expect(send).not.toHaveBeenCalled();
    },
  );

  it('não deve revelar falha do provedor de e-mail', async () => {
    const { send, useCase } = createFixture(ACTIVE_USER);

    send.mockRejectedValueOnce(new Error('indisponível'));

    await expect(useCase.execute({ email: ACTIVE_USER.email })).resolves.toBeUndefined();
  });

  it('não deve reenviar durante o intervalo de segurança da conta', async () => {
    const { send, useCase } = createFixture(ACTIVE_USER, null);

    await useCase.execute({ email: ACTIVE_USER.email });

    expect(send).not.toHaveBeenCalled();
  });
});
