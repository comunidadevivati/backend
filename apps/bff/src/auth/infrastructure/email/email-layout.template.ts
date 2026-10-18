// Layout dos e-mails transacionais, na identidade visual do frontend.

export const BRAND_NAME = 'Comunidade Viva e Eficaz';

const BRAND_TAGLINE = 'Um ambiente criado para conectar pessoas, ministérios e propósitos.';

const AUTOMATIC_EMAIL_NOTICE = 'Este é um e-mail automático. Não responda a esta mensagem.';

// Paleta do frontend (--viva-teal-* e --viva-blue-slate) em hexadecimal: clientes de e-mail não
// suportam oklch nem variáveis CSS.
const colors = {
  page: '#f0fdfa',
  card: '#ffffff',
  cardBorder: '#ccfbf1',
  gradientStart: '#0d9488',
  gradientMiddle: '#115e59',
  gradientEnd: '#042f2e',
  heading: '#042f2e',
  text: '#134e4a',
  muted: '#5c6b73',
  button: '#0f766e',
  buttonText: '#ffffff',
  noticeBackground: '#f0fdfa',
  noticeBorder: '#99f6e4',
  noticeText: '#115e59',
  link: '#0f766e',
} as const;

const fontFamily = "'Roboto', 'Helvetica Neue', Helvetica, Arial, sans-serif";

const escapeHtml = (value: string): string =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');

const getFirstName = (name: string): string => name.trim().split(/\s+/u)[0] ?? name;

export interface BrandedEmail {
  // Título da página e do corpo do e-mail.
  title: string;
  // Texto curto exibido pelos clientes de e-mail ao lado do assunto.
  preheader: string;
  name: string;
  // Parágrafos em texto puro (escapados pelo layout).
  paragraphs: string[];
  action: {
    label: string;
    url: string;
  };
  // Destaque abaixo do botão: texto puro com um trecho em negrito.
  notice: {
    text: string;
    highlight: string;
    suffix: string;
  };
  // Observação final, como "ignore se não foi você".
  footnote: string;
  logoSrc: string;
}

export const renderBrandedEmailHtml = ({
  action,
  footnote,
  logoSrc,
  name,
  notice,
  paragraphs,
  preheader,
  title,
}: BrandedEmail): string => {
  const url = escapeHtml(action.url);

  const body = paragraphs
    .map(
      (paragraph) =>
        `<p style="margin:0 0 16px;font-size:16px;line-height:26px;">${escapeHtml(paragraph)}</p>`,
    )
    .join('\n            ');

  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>${escapeHtml(title)}</title>
<link href="https://fonts.googleapis.com/css2?family=Roboto:wght@400;500;700&display=swap" rel="stylesheet">
<style>
  body { margin: 0; padding: 0; width: 100% !important; }
  a { color: ${colors.link}; }
  @media (max-width: 620px) {
    .container { width: 100% !important; }
    .px { padding-left: 24px !important; padding-right: 24px !important; }
  }
</style>
</head>
<body style="margin:0;padding:0;background-color:${colors.page};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${escapeHtml(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${colors.page};">
  <tr>
    <td align="center" style="padding:40px 16px;">
      <table role="presentation" class="container" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:600px;background-color:${colors.card};border:1px solid ${colors.cardBorder};border-radius:16px;overflow:hidden;">
        <tr>
          <td align="center" bgcolor="${colors.gradientMiddle}" style="padding:40px 32px;background-color:${colors.gradientMiddle};background-image:linear-gradient(135deg, ${colors.gradientStart} 0%, ${colors.gradientMiddle} 55%, ${colors.gradientEnd} 100%);">
            <img src="${logoSrc}" width="240" height="83" alt="${BRAND_NAME}" style="display:block;width:240px;max-width:100%;height:auto;border:0;outline:none;text-decoration:none;">
          </td>
        </tr>
        <tr>
          <td class="px" style="padding:40px 48px 8px;font-family:${fontFamily};color:${colors.text};">
            <h1 style="margin:0 0 16px;font-size:24px;line-height:32px;font-weight:700;color:${colors.heading};">${escapeHtml(title)}</h1>
            <p style="margin:0 0 16px;font-size:16px;line-height:26px;">Olá, ${escapeHtml(getFirstName(name))}.</p>
            ${body}
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:12px 0 28px;">
              <tr>
                <td align="center" bgcolor="${colors.button}" style="border-radius:10px;background-color:${colors.button};">
                  <a href="${url}" target="_blank" style="display:inline-block;padding:14px 32px;font-family:${fontFamily};font-size:16px;line-height:20px;font-weight:500;color:${colors.buttonText};text-decoration:none;border-radius:10px;">${escapeHtml(action.label)}</a>
                </td>
              </tr>
            </table>
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 28px;">
              <tr>
                <td style="padding:14px 16px;background-color:${colors.noticeBackground};border:1px solid ${colors.noticeBorder};border-radius:10px;font-family:${fontFamily};font-size:14px;line-height:22px;color:${colors.noticeText};">
                  ${escapeHtml(notice.text)} <strong>${escapeHtml(notice.highlight)}</strong>${escapeHtml(notice.suffix)}
                </td>
              </tr>
            </table>
            <p style="margin:0 0 8px;font-size:14px;line-height:22px;color:${colors.muted};">Se o botão não funcionar, copie e cole este endereço no navegador:</p>
            <p style="margin:0 0 28px;font-size:13px;line-height:20px;word-break:break-all;"><a href="${url}" target="_blank" style="color:${colors.link};text-decoration:underline;">${url}</a></p>
            <p style="margin:0 0 32px;font-size:14px;line-height:22px;color:${colors.muted};">${escapeHtml(footnote)}</p>
          </td>
        </tr>
        <tr>
          <td class="px" style="padding:24px 48px 32px;border-top:1px solid ${colors.cardBorder};font-family:${fontFamily};">
            <p style="margin:0 0 4px;font-size:14px;line-height:20px;font-weight:500;color:${colors.heading};">${BRAND_NAME}</p>
            <p style="margin:0 0 12px;font-size:13px;line-height:20px;color:${colors.muted};">${BRAND_TAGLINE}</p>
            <p style="margin:0;font-size:12px;line-height:18px;color:${colors.muted};">${AUTOMATIC_EMAIL_NOTICE}</p>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`;
};

export const renderBrandedEmailText = ({
  action,
  footnote,
  name,
  notice,
  paragraphs,
}: Omit<BrandedEmail, 'logoSrc' | 'preheader' | 'title'>): string =>
  [
    `Olá, ${getFirstName(name)}.`,
    '',
    ...paragraphs,
    '',
    action.url,
    '',
    `${notice.text} ${notice.highlight}${notice.suffix}`,
    '',
    footnote,
    '',
    '—',
    BRAND_NAME,
    BRAND_TAGLINE,
    AUTOMATIC_EMAIL_NOTICE,
  ].join('\n');
