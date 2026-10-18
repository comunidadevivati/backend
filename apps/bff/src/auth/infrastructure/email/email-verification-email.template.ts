import {
  BRAND_NAME,
  renderBrandedEmailHtml,
  renderBrandedEmailText,
  type BrandedEmail,
} from './email-layout.template.js';
import type { RenderedEmail } from './password-recovery-email.template.js';

export interface EmailVerificationEmailContent {
  name: string;
  verificationUrl: string;
  ttlHours: number;
  logoSrc: string;
}

export const renderEmailVerificationEmail = ({
  name,
  verificationUrl,
  ttlHours,
  logoSrc,
}: EmailVerificationEmailContent): RenderedEmail => {
  const email: BrandedEmail = {
    title: 'Confirme seu e-mail',
    preheader: `Confirme seu e-mail para ativar sua conta. O link expira em ${ttlHours} horas.`,
    name,
    paragraphs: [
      `Que bom ter você na ${BRAND_NAME}! Para concluir o cadastro, confirme que este é o seu e-mail clicando no botão abaixo.`,
    ],
    action: { label: 'Confirmar meu e-mail', url: verificationUrl },
    notice: {
      text: 'Por segurança, este link expira em',
      highlight: `${ttlHours} horas`,
      suffix: ' e só pode ser usado uma vez.',
    },
    footnote: 'Se você não criou uma conta, ignore esta mensagem.',
    logoSrc,
  };

  return {
    subject: `Confirme seu e-mail — ${BRAND_NAME}`,
    html: renderBrandedEmailHtml(email),
    text: renderBrandedEmailText(email),
  };
};
