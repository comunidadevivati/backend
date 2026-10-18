import { describe, expect, it } from 'vitest';
import { renderPasswordRecoveryEmail } from './password-recovery-email.template.js';

const content = {
  name: 'Maria <Souza> Silva',
  resetUrl: 'https://app.exemplo.com/reset-password?token=abc&x=1',
  ttlMinutes: 15,
  logoSrc: 'cid:logo-comunidade-viva',
};

describe('renderPasswordRecoveryEmail', () => {
  it('deve montar o assunto com o nome da comunidade', () => {
    expect(renderPasswordRecoveryEmail(content).subject).toBe(
      'Redefinição de senha — Comunidade Viva e Eficaz',
    );
  });

  it('deve gerar HTML com logo, botão, link escapado, prazo e primeiro nome', () => {
    const { html } = renderPasswordRecoveryEmail(content);

    expect(html).toContain('<img src="cid:logo-comunidade-viva"');

    expect(html).toContain('Olá, Maria.');

    expect(html).toContain('href="https://app.exemplo.com/reset-password?token=abc&amp;x=1"');

    expect(html).toContain('Redefinir minha senha');

    expect(html).toContain('<strong>15 minutos</strong>');

    expect(html).not.toContain('<Souza>');
  });

  it('deve escapar caracteres HTML no nome', () => {
    const { html } = renderPasswordRecoveryEmail({ ...content, name: '<script>alert(1)</script>' });

    expect(html).toContain('Olá, &lt;script&gt;alert(1)&lt;/script&gt;.');

    expect(html).not.toContain('<script>');
  });

  it('deve gerar versão em texto com o link sem escape e o prazo', () => {
    const { text } = renderPasswordRecoveryEmail(content);

    expect(text).toContain('Olá, Maria.');

    expect(text).toContain('https://app.exemplo.com/reset-password?token=abc&x=1');

    expect(text).toContain('expira em 15 minutos');

    expect(text).not.toContain('<');
  });
});
