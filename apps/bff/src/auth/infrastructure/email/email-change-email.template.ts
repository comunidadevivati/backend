import {
  BRAND_NAME,
  renderBrandedEmailHtml,
  renderBrandedEmailText,
  type BrandedEmail,
} from './email-layout.template.js';
import type { RenderedEmail } from './password-recovery-email.template.js';

export interface EmailChangeConfirmationContent {
  name: string;
  confirmationUrl: string;
  ttlHours: number;
  logoSrc: string;
}

export interface EmailChangedNoticeContent {
  name: string;
  newEmail: string;
  loginUrl: string;
  logoSrc: string;
}

// Enviado ao novo e-mail: a troca só vale depois que o link for aberto.
export const renderEmailChangeConfirmationEmail = ({
  confirmationUrl,
  logoSrc,
  name,
  ttlHours,
}: EmailChangeConfirmationContent): RenderedEmail => {
  const email: BrandedEmail = {
    title: 'Confirme seu novo e-mail',
    preheader: `Confirme o novo e-mail de acesso à sua conta. O link expira em ${ttlHours} horas.`,
    name,
    paragraphs: [
      `Recebemos um pedido para usar este endereço como e-mail de acesso à sua conta na ${BRAND_NAME}. Para concluir a troca, clique no botão abaixo.`,
    ],
    action: { label: 'Confirmar novo e-mail', url: confirmationUrl },
    notice: {
      text: 'Por segurança, este link expira em',
      highlight: `${ttlHours} horas`,
      suffix: ' e só pode ser usado uma vez.',
    },
    footnote: 'Se você não fez este pedido, ignore esta mensagem. Nada será alterado.',
    logoSrc,
  };

  return {
    subject: `Confirme seu novo e-mail — ${BRAND_NAME}`,
    html: renderBrandedEmailHtml(email),
    text: renderBrandedEmailText(email),
  };
};

// Enviado ao e-mail anterior depois da troca, para a pessoa perceber uma troca que não fez.
export const renderEmailChangedNoticeEmail = ({
  loginUrl,
  logoSrc,
  name,
  newEmail,
}: EmailChangedNoticeContent): RenderedEmail => {
  const email: BrandedEmail = {
    title: 'Seu e-mail de acesso foi alterado',
    preheader: 'O e-mail de acesso à sua conta foi alterado.',
    name,
    paragraphs: [
      `O e-mail de acesso à sua conta na ${BRAND_NAME} foi alterado. A partir de agora, entre com o novo endereço.`,
    ],
    action: { label: 'Acessar minha conta', url: loginUrl },
    notice: {
      text: 'Novo e-mail de acesso:',
      highlight: newEmail,
      suffix: '.',
    },
    footnote:
      'Se você não fez esta alteração, entre em contato com a administração da comunidade o quanto antes.',
    logoSrc,
  };

  return {
    subject: `Seu e-mail de acesso foi alterado — ${BRAND_NAME}`,
    html: renderBrandedEmailHtml(email),
    text: renderBrandedEmailText(email),
  };
};
