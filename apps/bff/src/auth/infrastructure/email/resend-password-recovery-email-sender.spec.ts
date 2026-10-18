import { afterEach, describe, expect, it, vi } from 'vitest';
import { DisabledPasswordRecoveryEmailSender } from './disabled-password-recovery-email-sender.js';
import { ResendEmailClient } from './resend-email.client.js';
import { ResendPasswordRecoveryEmailSender } from './resend-password-recovery-email-sender.js';
import type { ConfigService } from '@nestjs/config';

const config = {
  WEB_BASE_URL: 'https://app.exemplo.com',
  EMAIL_SEND_TIMEOUT_MS: 5000,
  RESEND_API_KEY: 're_teste',
  EMAIL_FROM: 'Segurança <seguranca@mail.exemplo.com>',
};

const configService = {
  getOrThrow: (key: keyof typeof config) => config[key],
} as unknown as ConfigService;

const createSender = () =>
  new ResendPasswordRecoveryEmailSender(configService, new ResendEmailClient(configService));

const message = {
  email: 'pessoa@exemplo.com',
  idempotencyKey: 'password-recovery/token-1',
  name: 'Pessoa <Exemplo>',
  token: 'token-secreto',
  ttlMinutes: 15,
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('ResendPasswordRecoveryEmailSender', () => {
  it('deve enviar versões texto e HTML com idempotência', async () => {
    const fetchMock = vi.fn<typeof fetch>(() =>
      Promise.resolve(new Response(null, { status: 200 })),
    );

    vi.stubGlobal('fetch', fetchMock);

    await createSender().send(message);

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.resend.com/emails',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer re_teste',
          'Idempotency-Key': 'password-recovery/token-1',
        }),
      }),
    );

    const request = fetchMock.mock.calls[0]?.[1] as RequestInit;

    const body = JSON.parse(String(request.body)) as {
      attachments: {
        content: string;
        content_id: string;
        content_type: string;
        filename: string;
      }[];
      from: string;
      html: string;
      subject: string;
      text: string;
    };

    expect(body.from).toBe('Segurança <seguranca@mail.exemplo.com>');

    expect(body.subject).toBe('Redefinição de senha — Comunidade Viva e Eficaz');

    expect(body.text).toContain('https://app.exemplo.com/reset-password?token=token-secreto');

    expect(body.html).toContain('Olá, Pessoa.');

    expect(body.html).toContain('src="cid:logo-comunidade-viva"');

    const [logo] = body.attachments;

    expect(logo).toMatchObject({
      filename: 'logo-comunidade-viva.png',
      content_type: 'image/png',
      content_id: 'logo-comunidade-viva',
    });

    // Assinatura de arquivo PNG em Base64.
    expect(logo?.content.startsWith('iVBORw0KGgo')).toBe(true);
  });

  it('deve falhar quando o Resend recusar o envio', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(new Response(null, { status: 429 }))),
    );

    await expect(createSender().send(message)).rejects.toThrow(
      'Resend recusou o envio com status 429.',
    );
  });

  it('deve permitir o adaptador desabilitado no desenvolvimento', async () => {
    await expect(new DisabledPasswordRecoveryEmailSender().send()).resolves.toBeUndefined();
  });
});
