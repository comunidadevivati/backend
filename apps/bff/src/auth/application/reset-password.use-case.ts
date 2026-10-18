import { Inject, Injectable } from '@nestjs/common';
import { getPersonalInfoTerms, isWeakPassword } from '../domain/policies/password-policy.js';
import { PasswordResetTokenRepository } from '../infrastructure/password-reset/password-reset-token.repository.js';
import { hashPassword, verifyPassword } from '../infrastructure/password/password-hasher.js';
import { SessionService } from '../infrastructure/session/session.service.js';
import type { LoginResult } from './login.use-case.js';

export interface ResetPasswordCommand {
  password: string;
  token: string;
}

export type ResetPasswordResult =
  | { status: 'reset'; session: LoginResult }
  | { status: 'invalid_token' }
  | { status: 'weak_password' };

@Injectable()
export class ResetPasswordUseCase {
  constructor(
    @Inject(PasswordResetTokenRepository)
    private readonly passwordResetTokenRepository: PasswordResetTokenRepository,
    @Inject(SessionService)
    private readonly sessionService: SessionService,
  ) {}

  async execute({ password, token }: ResetPasswordCommand): Promise<ResetPasswordResult> {
    const user = await this.passwordResetTokenRepository.findValidUser(token);

    if (!user) {
      return { status: 'invalid_token' };
    }

    const isCurrentPassword = await verifyPassword(password, user.passwordHash);

    if (
      isCurrentPassword ||
      isWeakPassword(password, getPersonalInfoTerms(user.name, user.email))
    ) {
      return { status: 'weak_password' };
    }

    const passwordHash = await hashPassword(password);

    // A troca revoga todas as sessões existentes; em seguida, abre uma nova só para quem redefiniu.
    if (!(await this.passwordResetTokenRepository.consume(token, user.id, passwordHash))) {
      return { status: 'invalid_token' };
    }

    const { token: sessionToken, csrfToken } = await this.sessionService.createSession(user.id);

    return {
      status: 'reset',
      session: {
        sessionToken,
        csrfToken,
        user: { id: user.id, email: user.email, name: user.name },
      },
    };
  }
}
