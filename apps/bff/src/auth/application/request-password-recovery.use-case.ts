import { Inject, Injectable, Logger } from '@nestjs/common';
import { PasswordResetTokenRepository } from '../infrastructure/password-reset/password-reset-token.repository.js';
import { UserRepository } from '../infrastructure/users/user.repository.js';
import { PasswordRecoveryEmailSender } from './ports/password-recovery-email-sender.js';

export interface RequestPasswordRecoveryCommand {
  email: string;
}

@Injectable()
export class RequestPasswordRecoveryUseCase {
  private readonly logger = new Logger(RequestPasswordRecoveryUseCase.name);

  constructor(
    @Inject(UserRepository)
    private readonly userRepository: UserRepository,
    @Inject(PasswordResetTokenRepository)
    private readonly passwordResetTokenRepository: PasswordResetTokenRepository,
    @Inject(PasswordRecoveryEmailSender)
    private readonly passwordRecoveryEmailSender: PasswordRecoveryEmailSender,
  ) {}

  async execute({ email }: RequestPasswordRecoveryCommand): Promise<void> {
    const user = await this.userRepository.findByEmail(email);

    if (!user || user.status !== 'ACTIVE') {
      return;
    }

    const issuedToken = await this.passwordResetTokenRepository.issueForUser(user.id);

    if (!issuedToken) {
      return;
    }

    try {
      await this.passwordRecoveryEmailSender.send({
        email: user.email,
        name: user.name,
        token: issuedToken.token,
        ttlMinutes: issuedToken.ttlMinutes,
        idempotencyKey: `password-recovery/${issuedToken.id}`,
      });
    } catch {
      // A resposta pública permanece indistinguível. O alerta não contém e-mail, token ou payload.
      this.logger.error('Falha ao enviar e-mail de recuperação de senha.');
    }
  }
}
