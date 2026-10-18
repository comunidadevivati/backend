import { Inject, Injectable } from '@nestjs/common';
import { EmailVerificationTokenRepository } from '../infrastructure/email-verification/email-verification-token.repository.js';
import { EmailVerificationEmailSender } from './ports/email-verification-email-sender.js';

export interface SendEmailVerificationCommand {
  userId: string;
  email: string;
  name: string;
}

export type SendEmailVerificationResult = 'sent' | 'already_verified' | 'cooldown';

// Emite um novo link de verificação e o envia por e-mail. Falhas no envio são propagadas para que
// quem chamou decida se a operação deve falhar (reenvio) ou seguir (cadastro).
@Injectable()
export class SendEmailVerificationUseCase {
  constructor(
    @Inject(EmailVerificationTokenRepository)
    private readonly emailVerificationTokenRepository: EmailVerificationTokenRepository,
    @Inject(EmailVerificationEmailSender)
    private readonly emailVerificationEmailSender: EmailVerificationEmailSender,
  ) {}

  async execute({
    email,
    name,
    userId,
  }: SendEmailVerificationCommand): Promise<SendEmailVerificationResult> {
    const issued = await this.emailVerificationTokenRepository.issueForUser(userId);

    if (issued.status !== 'issued') {
      return issued.status;
    }

    await this.emailVerificationEmailSender.send({
      email,
      name,
      token: issued.token,
      ttlHours: issued.ttlHours,
      idempotencyKey: `email-verification/${issued.id}`,
    });

    return 'sent';
  }
}
