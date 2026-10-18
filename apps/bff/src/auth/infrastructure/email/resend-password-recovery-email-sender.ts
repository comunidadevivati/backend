import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  PasswordRecoveryEmailSender,
  type SendPasswordRecoveryEmail,
} from '../../application/ports/password-recovery-email-sender.js';
import { renderPasswordRecoveryEmail } from './password-recovery-email.template.js';

// Logo embutida como anexo inline (CID): aparece em qualquer ambiente, inclusive localhost, sem
// depender de uma URL pública. O mesmo caminho relativo vale para src/ e dist/.
const LOGO_CONTENT_ID = 'logo-comunidade-viva';

const LOGO_FILENAME = 'logo-comunidade-viva.png';

const logoPath = fileURLToPath(
  new URL(`../../../../assets/email/${LOGO_FILENAME}`, import.meta.url),
);

let logoBase64: string | undefined;

const getLogoBase64 = (): string => {
  logoBase64 ??= readFileSync(logoPath).toString('base64');

  return logoBase64;
};

@Injectable()
export class ResendPasswordRecoveryEmailSender extends PasswordRecoveryEmailSender {
  constructor(@Inject(ConfigService) private readonly configService: ConfigService) {
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

    const { subject, html, text } = renderPasswordRecoveryEmail({
      name,
      resetUrl: resetUrl.toString(),
      ttlMinutes,
      logoSrc: `cid:${LOGO_CONTENT_ID}`,
    });

    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      signal: AbortSignal.timeout(this.configService.getOrThrow<number>('EMAIL_SEND_TIMEOUT_MS')),
      headers: {
        Authorization: `Bearer ${this.configService.getOrThrow<string>('RESEND_API_KEY')}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': idempotencyKey,
      },
      body: JSON.stringify({
        from: this.configService.getOrThrow<string>('EMAIL_FROM'),
        to: [email],
        subject,
        text,
        html,
        attachments: [
          {
            filename: LOGO_FILENAME,
            content: getLogoBase64(),
            content_type: 'image/png',
            content_id: LOGO_CONTENT_ID,
          },
        ],
      }),
    });

    if (!response.ok) {
      throw new Error(`Resend recusou o envio com status ${response.status}.`);
    }
  }
}
