import { describe, expect, it } from 'vitest';
import { renderEmailVerificationEmail } from './email-verification-email.template.js';

const content = {
  name: 'Ana <Lima> Souza',
  verificationUrl: 'https://app.exemplo.com/verify-email?token=abc&x=1',
  ttlHours: 24,
  logoSrc: 'cid:logo-comunidade-viva',
};

describe('renderEmailVerificationEmail', () => {
  it('deve montar assunto, HTML e texto da confirmação de e-mail', () => {
    const { html, subject, text } = renderEmailVerificationEmail(content);

    expect(subject).toBe('Confirme seu e-mail — Comunidade Viva e Eficaz');

    expect(html).toContain('<img src="cid:logo-comunidade-viva"');

    expect(html).toContain('Confirme seu e-mail');

    expect(html).toContain('Olá, Ana.');

    expect(html).toContain('href="https://app.exemplo.com/verify-email?token=abc&amp;x=1"');

    expect(html).toContain('Confirmar meu e-mail');

    expect(html).toContain('<strong>24 horas</strong>');

    expect(text).toContain('https://app.exemplo.com/verify-email?token=abc&x=1');

    expect(text).toContain('expira em 24 horas');

    expect(text).not.toContain('<');
  });
});
