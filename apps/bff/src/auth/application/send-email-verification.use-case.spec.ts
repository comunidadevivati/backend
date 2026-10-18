import { describe, expect, it, vi } from 'vitest';
import { SendEmailVerificationUseCase } from './send-email-verification.use-case.js';
import type {
  EmailVerificationTokenRepository,
  IssueEmailVerificationResult,
} from '../infrastructure/email-verification/email-verification-token.repository.js';
import type { EmailVerificationEmailSender } from './ports/email-verification-email-sender.js';

const command = { userId: 'usuario-1', email: 'pessoa@exemplo.com', name: 'Pessoa Exemplo' };

const createFixture = (issued: IssueEmailVerificationResult) => {
  const issueForUser = vi.fn(() => Promise.resolve(issued));

  const send = vi.fn(() => Promise.resolve());

  const useCase = new SendEmailVerificationUseCase(
    { issueForUser } as unknown as EmailVerificationTokenRepository,
    { send } as unknown as EmailVerificationEmailSender,
  );

  return { issueForUser, send, useCase };
};

describe('SendEmailVerificationUseCase', () => {
  it('deve emitir o token e enviar o e-mail com chave de idempotência', async () => {
    const { issueForUser, send, useCase } = createFixture({
      status: 'issued',
      id: 'token-id',
      token: 'token-secreto',
      ttlHours: 24,
    });

    await expect(useCase.execute(command)).resolves.toBe('sent');

    expect(issueForUser).toHaveBeenCalledWith('usuario-1');

    expect(send).toHaveBeenCalledWith({
      email: 'pessoa@exemplo.com',
      name: 'Pessoa Exemplo',
      token: 'token-secreto',
      ttlHours: 24,
      idempotencyKey: 'email-verification/token-id',
    });
  });

  it.each(['already_verified', 'cooldown'] as const)(
    'não deve enviar e-mail quando o resultado for %s',
    async (status) => {
      const { send, useCase } = createFixture({ status });

      await expect(useCase.execute(command)).resolves.toBe(status);

      expect(send).not.toHaveBeenCalled();
    },
  );
});
