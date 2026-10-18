import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PasswordRecoveryEmailSender } from './application/ports/password-recovery-email-sender.js';
import { RequestPasswordRecoveryUseCase } from './application/request-password-recovery.use-case.js';
import { ResetPasswordUseCase } from './application/reset-password.use-case.js';
import { DisabledPasswordRecoveryEmailSender } from './infrastructure/email/disabled-password-recovery-email-sender.js';
import { ResendPasswordRecoveryEmailSender } from './infrastructure/email/resend-password-recovery-email-sender.js';
import { PasswordResetTokenRepository } from './infrastructure/password-reset/password-reset-token.repository.js';
import { SessionService } from './infrastructure/session/session.service.js';
import { UserRepository } from './infrastructure/users/user.repository.js';
import { PasswordRecoveryController } from './presentation/password-recovery.controller.js';
import { SessionCookieService } from './presentation/session-cookie.service.js';

@Module({
  controllers: [PasswordRecoveryController],
  providers: [
    RequestPasswordRecoveryUseCase,
    ResetPasswordUseCase,
    UserRepository,
    PasswordResetTokenRepository,
    SessionService,
    SessionCookieService,
    DisabledPasswordRecoveryEmailSender,
    ResendPasswordRecoveryEmailSender,
    {
      provide: PasswordRecoveryEmailSender,
      inject: [
        ConfigService,
        DisabledPasswordRecoveryEmailSender,
        ResendPasswordRecoveryEmailSender,
      ],
      useFactory: (
        configService: ConfigService,
        disabledSender: DisabledPasswordRecoveryEmailSender,
        resendSender: ResendPasswordRecoveryEmailSender,
      ) =>
        configService.getOrThrow<string>('EMAIL_PROVIDER') === 'resend'
          ? resendSender
          : disabledSender,
    },
  ],
})
export class PasswordRecoveryModule {}
