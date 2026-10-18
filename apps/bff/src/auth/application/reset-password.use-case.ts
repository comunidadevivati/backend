import { Inject, Injectable } from '@nestjs/common';
import { getPersonalInfoTerms, isWeakPassword } from '../domain/policies/password-policy.js';
import { PasswordResetTokenRepository } from '../infrastructure/password-reset/password-reset-token.repository.js';
import { hashPassword, verifyPassword } from '../infrastructure/password/password-hasher.js';

export interface ResetPasswordCommand {
  password: string;
  token: string;
}

export type ResetPasswordResult = 'reset' | 'invalid_token' | 'weak_password';

@Injectable()
export class ResetPasswordUseCase {
  constructor(
    @Inject(PasswordResetTokenRepository)
    private readonly passwordResetTokenRepository: PasswordResetTokenRepository,
  ) {}

  async execute({ password, token }: ResetPasswordCommand): Promise<ResetPasswordResult> {
    const user = await this.passwordResetTokenRepository.findValidUser(token);

    if (!user) {
      return 'invalid_token';
    }

    const isCurrentPassword = await verifyPassword(password, user.passwordHash);

    if (
      isCurrentPassword ||
      isWeakPassword(password, getPersonalInfoTerms(user.name, user.email))
    ) {
      return 'weak_password';
    }

    const passwordHash = await hashPassword(password);

    return (await this.passwordResetTokenRepository.consume(token, user.id, passwordHash))
      ? 'reset'
      : 'invalid_token';
  }
}
