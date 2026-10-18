import { describe, expect, it, vi } from 'vitest';
import { VerifyEmailUseCase } from './verify-email.use-case.js';
import type { EmailVerificationTokenRepository } from '../infrastructure/email-verification/email-verification-token.repository.js';

const createUseCase = (verified: boolean) =>
  new VerifyEmailUseCase({
    verify: vi.fn(() => Promise.resolve(verified)),
  } as unknown as EmailVerificationTokenRepository);

describe('VerifyEmailUseCase', () => {
  it('deve confirmar o e-mail com token válido', async () => {
    await expect(createUseCase(true).execute('token')).resolves.toBe('verified');
  });

  it('deve recusar token inválido, expirado ou já usado', async () => {
    await expect(createUseCase(false).execute('token')).resolves.toBe('invalid_token');
  });
});
