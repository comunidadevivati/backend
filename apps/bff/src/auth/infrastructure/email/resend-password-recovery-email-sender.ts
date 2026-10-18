import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  PasswordRecoveryEmailSender,
  type SendPasswordRecoveryEmail,
} from '../../application/ports/password-recovery-email-sender.js';
import { renderPasswordRecoveryEmail } from './password-recovery-email.template.js';
import { EMAIL_LOGO_SRC, ResendEmailClient } from './resend-email.client.js';

@Injectable()
export class ResendPasswordRecoveryEmailSender extends PasswordRecoveryEmailSender {
  constructor(
    @Inject(ConfigService) private readonly configService: ConfigService,
    @Inject(ResendEmailClient) private readonly resendEmailClient: ResendEmailClient,
  ) {
    super();
  }

  async send({
    email,
    idempotencyKey,
    name,
    token,
    ttlMinutes,
  }: SendPasswordRecoveryEmail): Promise<void> {
    const resetUrl = new URL(
      '/reset-password',
      this.configService.getOrThrow<string>('WEB_BASE_URL'),
    );

    resetUrl.searchParams.set('token', token);

    await this.resendEmailClient.send({
      to: email,
      idempotencyKey,
      ...renderPasswordRecoveryEmail({
        name,
        resetUrl: resetUrl.toString(),
        ttlMinutes,
        logoSrc: EMAIL_LOGO_SRC,
      }),
    });
  }
}
