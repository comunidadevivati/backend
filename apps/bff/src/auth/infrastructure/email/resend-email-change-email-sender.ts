import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  EmailChangeEmailSender,
  type SendEmailChangeConfirmation,
  type SendEmailChangedNotice,
} from '../../application/ports/email-change-email-sender.js';
import {
  renderEmailChangeConfirmationEmail,
  renderEmailChangedNoticeEmail,
} from './email-change-email.template.js';
import { EMAIL_LOGO_SRC, ResendEmailClient } from './resend-email.client.js';

@Injectable()
export class ResendEmailChangeEmailSender extends EmailChangeEmailSender {
  constructor(
    @Inject(ConfigService) private readonly configService: ConfigService,
    @Inject(ResendEmailClient) private readonly resendEmailClient: ResendEmailClient,
  ) {
    super();
  }

  async sendConfirmation({
    email,
    idempotencyKey,
    name,
    token,
    ttlHours,
  }: SendEmailChangeConfirmation): Promise<void> {
    const confirmationUrl = this.webUrl('/confirm-email-change');

    confirmationUrl.searchParams.set('token', token);

    await this.resendEmailClient.send({
      to: email,
      idempotencyKey,
      ...renderEmailChangeConfirmationEmail({
        name,
        confirmationUrl: confirmationUrl.toString(),
        ttlHours,
        logoSrc: EMAIL_LOGO_SRC,
      }),
    });
  }

  async sendChangedNotice({
    email,
    idempotencyKey,
    name,
    newEmail,
  }: SendEmailChangedNotice): Promise<void> {
    await this.resendEmailClient.send({
      to: email,
      idempotencyKey,
      ...renderEmailChangedNoticeEmail({
        name,
        newEmail,
        loginUrl: this.webUrl('/login').toString(),
        logoSrc: EMAIL_LOGO_SRC,
      }),
    });
  }

  private webUrl(path: string): URL {
    return new URL(path, this.configService.getOrThrow<string>('WEB_BASE_URL'));
  }
}
