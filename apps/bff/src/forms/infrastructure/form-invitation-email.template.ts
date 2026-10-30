import {
  BRAND_NAME,
  renderBrandedEmailHtml,
  renderBrandedEmailText,
  type BrandedEmail,
} from '../../auth/infrastructure/email/email-layout.template.js';
import type { RenderedEmail } from '../../auth/infrastructure/email/password-recovery-email.template.js';

export interface FormInvitationEmailContent {
  name: string;
  formTitle: string;
  formDescription: string | null;
  startsOn: string;
  endsOn: string;
  kind: 'INVITE' | 'REMINDER';
  message: string | null;
  answerUrl: string;
  logoSrc: string;
}

// AAAA-MM-DD → DD/MM/AAAA (datas civis, sem fuso).
const formatDate = (value: string): string => value.split('-').toReversed().join('/');

export const renderFormInvitationEmail = ({
  answerUrl,
  endsOn,
  formDescription,
  formTitle,
  kind,
  logoSrc,
  message,
  name,
  startsOn,
}: FormInvitationEmailContent): RenderedEmail => {
  const isReminder = kind === 'REMINDER';

  const email: BrandedEmail = {
    title: isReminder ? `Lembrete: ${formTitle}` : formTitle,
    preheader: `Responda até ${formatDate(endsOn)} pelo seu link pessoal.`,
    name,
    paragraphs: [
      isReminder
        ? `Ainda não recebemos a sua resposta ao formulário "${formTitle}" da ${BRAND_NAME}.`
        : `Você foi convidado(a) a responder o formulário "${formTitle}" da ${BRAND_NAME}.`,
      ...(message ? [message] : []),
      ...(formDescription && !isReminder ? [formDescription] : []),
      'Seu nome e seu e-mail já vêm preenchidos. Clique no botão abaixo para responder. Se preferir, imprima o PDF anexo, preencha à mão e entregue à liderança.',
    ],
    action: { label: 'Responder formulário', url: answerUrl },
    notice: {
      text: 'O formulário recebe respostas de',
      highlight: `${formatDate(startsOn)} a ${formatDate(endsOn)}`,
      suffix: '. O link é pessoal: não o compartilhe.',
    },
    footnote:
      'Se você receber este formulário de novo, use o link do e-mail mais recente: os anteriores deixam de valer.',
    logoSrc,
  };

  return {
    subject: `${isReminder ? 'Lembrete: ' : ''}${formTitle} — ${BRAND_NAME}`,
    html: renderBrandedEmailHtml(email),
    text: renderBrandedEmailText(email),
  };
};

const escapeHtml = (value: string) =>
  value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');

// Cópia das respostas: e-mail curto com o PDF anexo (sem botão de ação).
export const renderAnswersCopyEmail = ({
  formTitle,
  name,
}: {
  formTitle: string;
  name: string;
}): RenderedEmail => {
  const firstName = name.trim().split(/\s+/u)[0] ?? name;

  const text = [
    `Olá, ${firstName}.`,
    '',
    `Recebemos as suas respostas ao formulário "${formTitle}". A cópia está no PDF anexo.`,
    '',
    '—',
    BRAND_NAME,
    'Este é um e-mail automático. Não responda a esta mensagem.',
  ].join('\n');

  const html = `<!doctype html><html lang="pt-BR"><body style="font-family:Arial,sans-serif;color:#134e4a;">${text
    .split('\n')
    .map((line) => `<p style="margin:0 0 12px;">${escapeHtml(line) || '&nbsp;'}</p>`)
    .join('')}</body></html>`;

  return { subject: `Suas respostas: ${formTitle} — ${BRAND_NAME}`, html, text };
};
