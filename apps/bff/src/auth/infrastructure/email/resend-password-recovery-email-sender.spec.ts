import { afterEach, describe, expect, it, vi } from 'vitest';
import { DisabledPasswordRecoveryEmailSender } from './disabled-password-recovery-email-sender.js';
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

    await new ResendPasswordRecoveryEmailSender(configService).send(message);

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

    const body = JSON.parse(String(request.body)) as { html: string; text: string };

    expect(body.text).toContain('https://app.exemplo.com/reset-password?token=token-secreto');

    expect(body.html).toContain('Pessoa &lt;Exemplo&gt;');
  });

  it('deve falhar quando o Resend recusar o envio', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(new Response(null, { status: 429 }))),
    );

    await expect(
      new ResendPasswordRecoveryEmailSender(configService).send(message),
    ).rejects.toThrow('Resend recusou o envio com status 429.');
  });

  it('deve permitir o adaptador desabilitado no desenvolvimento', async () => {
    await expect(new DisabledPasswordRecoveryEmailSender().send()).resolves.toBeUndefined();
  });
});
