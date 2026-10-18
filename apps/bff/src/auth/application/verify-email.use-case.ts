import { Inject, Injectable } from '@nestjs/common';
import { EmailVerificationTokenRepository } from '../infrastructure/email-verification/email-verification-token.repository.js';

export type VerifyEmailResult = 'verified' | 'invalid_token';

@Injectable()
export class VerifyEmailUseCase {
  constructor(
    @Inject(EmailVerificationTokenRepository)
    private readonly emailVerificationTokenRepository: EmailVerificationTokenRepository,
  ) {}

  async execute(token: string): Promise<VerifyEmailResult> {
    return (await this.emailVerificationTokenRepository.verify(token))
      ? 'verified'
      : 'invalid_token';
  }
}
