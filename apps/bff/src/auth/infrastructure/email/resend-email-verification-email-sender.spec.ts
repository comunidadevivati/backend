import { afterEach, describe, expect, it, vi } from 'vitest';
import { DisabledEmailVerificationEmailSender } from './disabled-email-verification-email-sender.js';
import { ResendEmailVerificationEmailSender } from './resend-email-verification-email-sender.js';
import { ResendEmailClient } from './resend-email.client.js';
import type { ConfigService } from '@nestjs/config';

const config = {
  WEB_BASE_URL: 'https://app.exemplo.com',
  EMAIL_SEND_TIMEOUT_MS: 5000,
  RESEND_API_KEY: 're_teste',
  EMAIL_FROM: 'Comunidade <seguranca@mail.exemplo.com>',
};

const configService = {
  getOrThrow: (key: keyof typeof config) => config[key],
} as unknown as ConfigService;

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('ResendEmailVerificationEmailSender', () => {
  it('deve enviar o link de verificação com idempotência e logo inline', async () => {
    const fetchMock = vi.fn<typeof fetch>(() =>
      Promise.resolve(new Response(null, { status: 200 })),
    );

    vi.stubGlobal('fetch', fetchMock);

    await new ResendEmailVerificationEmailSender(
      configService,
      new ResendEmailClient(configService),
    ).send({
      email: 'pessoa@exemplo.com',
      idempotencyKey: 'email-verification/token-1',
      name: 'Pessoa Exemplo',
      token: 'token-secreto',
      ttlHours: 24,
    });

    const request = fetchMock.mock.calls[0]?.[1] as RequestInit;

    const body = JSON.parse(String(request.body)) as {
      attachments: { content_id: string }[];
      subject: string;
      text: string;
      to: string[];
    };

    expect(request.headers).toMatchObject({ 'Idempotency-Key': 'email-verification/token-1' });

    expect(body.to).toEqual(['pessoa@exemplo.com']);

    expect(body.subject).toBe('Confirme seu e-mail — Comunidade Viva e Eficaz');

    expect(body.text).toContain('https://app.exemplo.com/verify-email?token=token-secreto');

    expect(body.attachments[0]?.content_id).toBe('logo-comunidade-viva');
  });

  it('deve permitir o adaptador desabilitado no desenvolvimento', async () => {
    await expect(new DisabledEmailVerificationEmailSender().send()).resolves.toBeUndefined();
  });
});
