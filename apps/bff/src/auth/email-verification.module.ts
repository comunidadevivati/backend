import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EmailVerificationEmailSender } from './application/ports/email-verification-email-sender.js';
import { SendEmailVerificationUseCase } from './application/send-email-verification.use-case.js';
import { VerifyEmailUseCase } from './application/verify-email.use-case.js';
import { EmailVerificationTokenRepository } from './infrastructure/email-verification/email-verification-token.repository.js';
import { DisabledEmailVerificationEmailSender } from './infrastructure/email/disabled-email-verification-email-sender.js';
import { ResendEmailVerificationEmailSender } from './infrastructure/email/resend-email-verification-email-sender.js';
import { ResendEmailClient } from './infrastructure/email/resend-email.client.js';
import { SessionService } from './infrastructure/session/session.service.js';
import { EmailVerificationController } from './presentation/email-verification.controller.js';
import { SessionCookieService } from './presentation/session-cookie.service.js';

@Module({
  controllers: [EmailVerificationController],
  providers: [
    VerifyEmailUseCase,
    SendEmailVerificationUseCase,
    EmailVerificationTokenRepository,
    SessionService,
    SessionCookieService,
    ResendEmailClient,
    DisabledEmailVerificationEmailSender,
    ResendEmailVerificationEmailSender,
    {
      provide: EmailVerificationEmailSender,
      inject: [
        ConfigService,
        DisabledEmailVerificationEmailSender,
        ResendEmailVerificationEmailSender,
      ],
      useFactory: (
        configService: ConfigService,
        disabledSender: DisabledEmailVerificationEmailSender,
        resendSender: ResendEmailVerificationEmailSender,
      ) =>
        configService.getOrThrow<string>('EMAIL_PROVIDER') === 'resend'
          ? resendSender
          : disabledSender,
    },
  ],
  // O cadastro (AuthModule) envia o primeiro link de verificação.
  exports: [SendEmailVerificationUseCase],
})
export class EmailVerificationModule {}
