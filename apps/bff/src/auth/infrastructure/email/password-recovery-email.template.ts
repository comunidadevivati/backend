import {
  BRAND_NAME,
  renderBrandedEmailHtml,
  renderBrandedEmailText,
  type BrandedEmail,
} from './email-layout.template.js';

export interface PasswordRecoveryEmailContent {
  name: string;
  resetUrl: string;
  ttlMinutes: number;
  logoSrc: string;
}

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

export const renderPasswordRecoveryEmail = ({
  name,
  resetUrl,
  ttlMinutes,
  logoSrc,
}: PasswordRecoveryEmailContent): RenderedEmail => {
  const email: BrandedEmail = {
    title: 'Redefina sua senha',
    preheader: `Use o link para criar uma nova senha. Ele expira em ${ttlMinutes} minutos.`,
    name,
    paragraphs: [
      `Recebemos uma solicitação para redefinir a senha da sua conta na ${BRAND_NAME}. Para criar uma nova senha, clique no botão abaixo.`,
    ],
    action: { label: 'Redefinir minha senha', url: resetUrl },
    notice: {
      text: 'Por segurança, este link expira em',
      highlight: `${ttlMinutes} minutos`,
      suffix: ' e só pode ser usado uma vez.',
    },
    footnote:
      'Se você não fez esta solicitação, ignore esta mensagem. Sua senha atual continua válida.',
    logoSrc,
  };

  return {
    subject: `Redefinição de senha — ${BRAND_NAME}`,
    html: renderBrandedEmailHtml(email),
    text: renderBrandedEmailText(email),
  };
};
