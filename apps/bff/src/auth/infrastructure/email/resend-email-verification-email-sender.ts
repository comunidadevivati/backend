import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  EmailVerificationEmailSender,
  type SendEmailVerificationEmail,
} from '../../application/ports/email-verification-email-sender.js';
import { renderEmailVerificationEmail } from './email-verification-email.template.js';
import { EMAIL_LOGO_SRC, ResendEmailClient } from './resend-email.client.js';

@Injectable()
export class ResendEmailVerificationEmailSender extends EmailVerificationEmailSender {
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
    ttlHours,
  }: SendEmailVerificationEmail): Promise<void> {
    const verificationUrl = new URL(
      '/verify-email',
      this.configService.getOrThrow<string>('WEB_BASE_URL'),
    );

    verificationUrl.searchParams.set('token', token);

    await this.resendEmailClient.send({
      to: email,
      idempotencyKey,
      ...renderEmailVerificationEmail({
        name,
        verificationUrl: verificationUrl.toString(),
        ttlHours,
        logoSrc: EMAIL_LOGO_SRC,
      }),
    });
  }
}
