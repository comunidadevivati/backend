import { Inject, Injectable } from '@nestjs/common';
import {
  EMAIL_LOGO_SRC,
  ResendEmailClient,
} from '../../auth/infrastructure/email/resend-email.client.js';
import {
  FormInvitationEmailSender,
  type SendAnswersCopyEmail,
  type SendFormInvitationEmail,
} from '../application/form-invitation-email-sender.js';
import {
  renderAnswersCopyEmail,
  renderFormInvitationEmail,
} from './form-invitation-email.template.js';

const pdfAttachment = ({ content, filename }: { filename: string; content: Uint8Array }) => ({
  filename,
  content: Buffer.from(content).toString('base64'),
  contentType: 'application/pdf',
});

@Injectable()
export class ResendFormInvitationEmailSender extends FormInvitationEmailSender {
  readonly enabled = true;

  constructor(@Inject(ResendEmailClient) private readonly resendEmailClient: ResendEmailClient) {
    super();
  }

  async send({
    email,
    idempotencyKey,
    printout,
    ...content
  }: SendFormInvitationEmail): Promise<{ messageId: string | null }> {
    const { id } = await this.resendEmailClient.send({
      to: email,
      idempotencyKey,
      attachments: printout ? [pdfAttachment(printout)] : [],
      ...renderFormInvitationEmail({ ...content, logoSrc: EMAIL_LOGO_SRC }),
    });

    return { messageId: id };
  }

  async sendAnswersCopy({
    email,
    formTitle,
    idempotencyKey,
    name,
    pdf,
  }: SendAnswersCopyEmail): Promise<void> {
    await this.resendEmailClient.send({
      to: email,
      idempotencyKey,
      attachments: [pdfAttachment(pdf)],
      ...renderAnswersCopyEmail({ formTitle, name }),
    });
  }
}

// EMAIL_PROVIDER=disabled: nenhum e-mail sai (o envio termina com todos como falha).
@Injectable()
export class DisabledFormInvitationEmailSender extends FormInvitationEmailSender {
  readonly enabled = false;

  send(): Promise<{ messageId: string | null }> {
    return Promise.resolve({ messageId: null });
  }

  sendAnswersCopy(): Promise<void> {
    return Promise.resolve();
  }
}
