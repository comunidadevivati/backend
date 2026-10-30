import { setTimeout as sleep } from 'node:timers/promises';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import QRCode from 'qrcode';
import { UserAccountRepository } from '../../auth/infrastructure/users/user-account.repository.js';
import { CoreApiClient } from '../../core-api/infrastructure/core-api.client.js';
import { FormInvitationEmailSender } from './form-invitation-email-sender.js';
import { FormPrintout, type FormPrintoutContent } from './form-printout.js';

// Formulário como devolvido pela Core API ao iniciar o envio (só o usado no e-mail).
export interface StartedDispatch {
  dispatchId: string;
  recipientAccountIds: string[];
  form: {
    id: string;
    title: string;
    description: string | null;
    startsOn: string;
    endsOn: string;
    questions: FormPrintoutContent['questions'];
    consentText: string | null;
  };
}

// Como enviar: convite ou lembrete, com mensagem opcional de quem enviou.
export interface DispatchOptions {
  kind: 'INVITE' | 'REMINDER';
  message: string | null;
}

interface Delivery {
  accountId: string;
  messageId: string | null;
  sent: boolean;
}

interface InvitationLink {
  accountId: string;
  name: string;
  email: string;
  token: string;
}

// Intervalo entre e-mails, abaixo do limite de requisições por segundo do Resend.
const SEND_INTERVAL_MS = 600;

// Tentativas por e-mail (falhas de rede, limite de requisições, 5xx).
const MAX_ATTEMPTS = 3;

// Envio dos e-mails de um formulário aos grupos (ADR 0013), fora da requisição: o painel acompanha a
// situação "SENDING" do formulário até a conclusão. A Core API desbloqueia sozinha um envio parado
// por mais de 15 minutos (ex.: BFF reiniciado no meio).
@Injectable()
export class FormEmailDispatchService {
  private readonly logger = new Logger(FormEmailDispatchService.name);

  constructor(
    @Inject(CoreApiClient) private readonly coreApi: CoreApiClient,
    @Inject(UserAccountRepository) private readonly accounts: UserAccountRepository,
    @Inject(FormInvitationEmailSender) private readonly sender: FormInvitationEmailSender,
    @Inject(ConfigService) private readonly configService: ConfigService,
    @Inject(FormPrintout) private readonly printout: FormPrintout,
  ) {}

  run(dispatch: StartedDispatch, options: DispatchOptions): void {
    void this.dispatch(dispatch, options).catch((error: unknown) => {
      this.logger.error(
        `Envio de e-mails do formulário ${dispatch.form.id} falhou: ${String(error)}`,
      );
    });
  }

  private async dispatch(
    { dispatchId, form, recipientAccountIds }: StartedDispatch,
    options: DispatchOptions,
  ) {
    let sentCount = 0;

    let failedCount = 0;

    const deliveries: Delivery[] = [];

    try {
      const recipients = await this.accounts.findEmailRecipients(recipientAccountIds);

      const links = await this.prepareInvitations(form.id, dispatchId, recipients);

      // Convite: contas dos grupos suspensas ou não verificadas não recebem e contam como falha. No
      // lembrete, só os pendentes entram (quem já respondeu não conta).
      failedCount = options.kind === 'INVITE' ? recipientAccountIds.length - recipients.length : 0;

      for (const [index, link] of links.entries()) {
        if (index > 0) {
          // oxlint-disable-next-line no-await-in-loop -- envio em sequência, respeitando o limite
          await sleep(SEND_INTERVAL_MS);
        }

        // oxlint-disable-next-line no-await-in-loop -- um e-mail por vez
        const delivery = await this.sendWithRetry(form, dispatchId, link, options);

        deliveries.push(delivery);

        if (delivery.sent) {
          sentCount += 1;
        } else {
          failedCount += 1;
        }
      }
    } catch (error) {
      this.logger.error(`Preparação do envio ${dispatchId} falhou: ${String(error)}`);

      failedCount = Math.max(failedCount, recipientAccountIds.length - sentCount);
    }

    await this.finish(form.id, dispatchId, { sentCount, failedCount, deliveries });
  }

  private async prepareInvitations(
    formId: string,
    dispatchId: string,
    recipients: { id: string; name: string; email: string }[],
  ): Promise<InvitationLink[]> {
    const response = await this.coreApi.send({
      method: 'POST',
      path: `forms/${formId}/email-dispatches/${dispatchId}/invitations`,
      body: {
        recipients: recipients.map(({ email, id, name }) => ({ accountId: id, name, email })),
      },
    });

    if (response.status !== 200) {
      throw new Error(`Core API respondeu ${response.status} ao preparar os convites.`);
    }

    return (response.body as { items: InvitationLink[] }).items;
  }

  private async sendWithRetry(
    form: StartedDispatch['form'],
    dispatchId: string,
    { accountId, email, name, token }: InvitationLink,
    { kind, message }: DispatchOptions,
  ): Promise<Delivery> {
    if (!this.sender.enabled) {
      return { accountId, messageId: null, sent: false };
    }

    const answerUrl = new URL(
      '/formularios/responder',
      this.configService.getOrThrow('WEB_BASE_URL'),
    );

    answerUrl.searchParams.set('token', token);

    const printout = await this.renderPrintout(form, { name, email }, answerUrl.toString());

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
      try {
        // oxlint-disable-next-line no-await-in-loop -- novas tentativas do mesmo e-mail
        const { messageId } = await this.sender.send({
          email,
          name,
          formTitle: form.title,
          formDescription: form.description,
          startsOn: form.startsOn,
          endsOn: form.endsOn,
          kind,
          message,
          answerUrl: answerUrl.toString(),
          idempotencyKey: `form-invitation/${dispatchId}/${email}`,
          printout,
        });

        return { accountId, messageId, sent: true };
      } catch (error) {
        this.logger.warn(
          `E-mail do envio ${dispatchId} falhou (tentativa ${attempt}): ${String(error)}`,
        );

        // oxlint-disable-next-line no-await-in-loop -- espera crescente entre as tentativas
        await sleep(attempt * 1500);
      }
    }

    return { accountId, messageId: null, sent: false };
  }

  // PDF personalizado (nome e e-mail preenchidos, QR code do link pessoal). Sem ele, o e-mail segue
  // só com o link.
  private async renderPrintout(
    { consentText, description, endsOn, questions, startsOn, title }: StartedDispatch['form'],
    recipient: { name: string; email: string },
    answerUrl: string,
  ) {
    try {
      const qrCode = new Uint8Array(
        await QRCode.toBuffer(answerUrl, { errorCorrectionLevel: 'M', margin: 1, width: 240 }),
      );

      const content = await this.printout.render({
        qrCode,
        title,
        description,
        startsOn,
        endsOn,
        questions,
        recipient,
        consentText,
      });

      return { filename: 'formulario-para-imprimir.pdf', content };
    } catch (error) {
      this.logger.warn(`PDF do formulário não gerado: ${String(error)}`);

      return null;
    }
  }

  private async finish(
    formId: string,
    dispatchId: string,
    result: { sentCount: number; failedCount: number; deliveries: Delivery[] },
  ) {
    const { failedCount, sentCount } = result;

    const response = await this.coreApi.send({
      method: 'PUT',
      path: `forms/${formId}/email-dispatches/${dispatchId}`,
      body: result,
    });

    if (response.status === 200) {
      this.logger.log(`Envio ${dispatchId}: ${sentCount} enviados, ${failedCount} com falha.`);
    } else {
      this.logger.error(`Core API respondeu ${response.status} ao concluir o envio ${dispatchId}.`);
    }
  }
}
