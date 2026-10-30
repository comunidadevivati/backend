import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { RenderedEmail } from './password-recovery-email.template.js';

// Logo embutida como anexo inline (CID): aparece em qualquer ambiente, inclusive localhost, sem
// depender de uma URL pública. O mesmo caminho relativo vale para src/ e dist/.
const LOGO_CONTENT_ID = 'logo-comunidade-viva';

const LOGO_FILENAME = 'logo-comunidade-viva.png';

export const EMAIL_LOGO_SRC = `cid:${LOGO_CONTENT_ID}`;

const logoPath = fileURLToPath(
  new URL(`../../../../assets/email/${LOGO_FILENAME}`, import.meta.url),
);

let logoBase64: string | undefined;

const getLogoBase64 = (): string => {
  logoBase64 ??= readFileSync(logoPath).toString('base64');

  return logoBase64;
};

interface EmailAttachment {
  filename: string;
  // Conteúdo em base64.
  content: string;
  contentType: string;
}

export interface ResendEmail extends RenderedEmail {
  to: string;
  idempotencyKey: string;
  // Anexos além da logo (ex.: PDF do formulário para impressão).
  attachments?: EmailAttachment[];
}

// Envio pela API HTTP do Resend, compartilhado pelos e-mails transacionais do BFF.
@Injectable()
export class ResendEmailClient {
  constructor(@Inject(ConfigService) private readonly configService: ConfigService) {}

  async send({
    attachments = [],
    html,
    idempotencyKey,
    subject,
    text,
    to,
  }: ResendEmail): Promise<{ id: string | null }> {
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
        to: [to],
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
          ...attachments.map(({ content, contentType, filename }) => ({
            filename,
            content,
            content_type: contentType,
          })),
        ],
      }),
    });

    if (!response.ok) {
      throw new Error(`Resend recusou o envio com status ${response.status}.`);
    }

    // ID da mensagem no Resend (usado para acompanhar a entrega pelo webhook).
    const body = (await response.json().catch(() => null)) as { id?: unknown } | null;

    return { id: typeof body?.id === 'string' ? body.id : null };
  }
}
