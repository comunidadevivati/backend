import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CoreApiModule } from '../core-api/core-api.module.js';
import { AccountSecurityUseCases } from './application/account-security.use-cases.js';
import { EmailChangeEmailSender } from './application/ports/email-change-email-sender.js';
import { PersonEmailSync } from './application/ports/person-email-sync.js';
import { EmailChangeTokenRepository } from './infrastructure/email-change/email-change-token.repository.js';
import { DisabledEmailChangeEmailSender } from './infrastructure/email/disabled-email-change-email-sender.js';
import { ResendEmailChangeEmailSender } from './infrastructure/email/resend-email-change-email-sender.js';
import { ResendEmailClient } from './infrastructure/email/resend-email.client.js';
import { CoreApiPersonEmailSync } from './infrastructure/members/core-api-person-email-sync.js';
import { SessionService } from './infrastructure/session/session.service.js';
import { AccountProfileRepository } from './infrastructure/users/account-profile.repository.js';
import { UserRepository } from './infrastructure/users/user.repository.js';
import { AccountSecurityController } from './presentation/account-security.controller.js';
import { SessionCookieService } from './presentation/session-cookie.service.js';

// Segurança da conta no Perfil: troca de senha e do e-mail de acesso (acompanhado pela Pessoa).
@Module({
  imports: [CoreApiModule],
  controllers: [AccountSecurityController],
  providers: [
    AccountSecurityUseCases,
    AccountProfileRepository,
    EmailChangeTokenRepository,
    UserRepository,
    SessionService,
    SessionCookieService,
    ResendEmailClient,
    DisabledEmailChangeEmailSender,
    ResendEmailChangeEmailSender,
    { provide: PersonEmailSync, useClass: CoreApiPersonEmailSync },
    {
      provide: EmailChangeEmailSender,
      inject: [ConfigService, DisabledEmailChangeEmailSender, ResendEmailChangeEmailSender],
      useFactory: (
        configService: ConfigService,
        disabledSender: DisabledEmailChangeEmailSender,
        resendSender: ResendEmailChangeEmailSender,
      ) =>
        configService.getOrThrow<string>('EMAIL_PROVIDER') === 'resend'
          ? resendSender
          : disabledSender,
    },
  ],
})
export class AccountSecurityModule {}
