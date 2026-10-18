import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  PasswordRecoveryEmailSender,
  type SendPasswordRecoveryEmail,
} from '../../application/ports/password-recovery-email-sender.js';

const escapeHtml = (value: string): string =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');

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
        subject: 'Redefinição de senha — Comunidade Viva e Eficaz',
        text: [
          `Olá, ${name}.`,
          '',
          'Recebemos uma solicitação para redefinir sua senha.',
          `Acesse o link a seguir em até ${ttlMinutes} minutos:`,
          resetUrl.toString(),
          '',
          'Se você não fez esta solicitação, ignore esta mensagem.',
        ].join('\n'),
        html: `<p>Olá, ${escapeHtml(name)}.</p>
<p>Recebemos uma solicitação para redefinir sua senha.</p>
<p><a href="${escapeHtml(resetUrl.toString())}">Redefinir minha senha</a></p>
<p>Este link expira em ${ttlMinutes} minutos.</p>
<p>Se você não fez esta solicitação, ignore esta mensagem.</p>`,
      }),
    });

    if (!response.ok) {
      throw new Error(`Resend recusou o envio com status ${response.status}.`);
    }
  }
}
