import { Inject, Injectable } from '@nestjs/common';
import { CoreApiClient } from '../../core-api/infrastructure/core-api.client.js';
import { FormPrintout, type PrintoutQuestion } from './form-printout.js';

interface CoreForm {
  title: string;
  description: string | null;
  startsOn: string;
  endsOn: string;
  anonymous: boolean;
  consentText: string | null;
  questions: (Omit<PrintoutQuestion, 'options'> & {
    id: string;
    options: { id: string; label: string }[];
  })[];
}

interface CoreInvitation {
  id: string;
  recipientName: string;
  recipientEmail: string;
  answeredAt: string | null;
  answerChannel: 'DIGITAL' | 'PAPER' | null;
  answers: { questionId: string; text: string | null; optionIds: string[]; value: number | null }[];
}

export type AnswersPdfResult =
  | { status: 'ok'; filename: string; content: Uint8Array }
  | { status: 'not_found' }
  | { status: 'not_answered' }
  | { status: 'anonymous' }
  | { status: 'unavailable' };

// Data e hora no fuso da comunidade (Campo Grande/MS).
const ANSWERED_AT_FORMAT = new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'America/Campo_Grande',
  dateStyle: 'short',
  timeStyle: 'short',
});

// Nome do arquivo: título e nome da pessoa, só com caracteres seguros.
const fileNameOf = (title: string, name: string): string =>
  `${title} - ${name}`
    .normalize('NFD')
    .replaceAll(/[̀-ͯ]/gu, '')
    .replaceAll(/[^\w .-]+/gu, '')
    .trim()
    .slice(0, 120)
    .concat('.pdf');

// PDF das respostas digitais de uma pessoa (ADR 0013), montado com os dados da Core API e o mesmo
// gerador da versão para impressão enviada por e-mail.
@Injectable()
export class FormAnswersPdfService {
  constructor(
    @Inject(CoreApiClient) private readonly coreApi: CoreApiClient,
    @Inject(FormPrintout) private readonly printout: FormPrintout,
  ) {}

  async render(formId: string, invitationId: string): Promise<AnswersPdfResult> {
    const [formResponse, invitationsResponse] = await Promise.all([
      this.coreApi.send({ method: 'GET', path: `forms/${formId}` }),
      this.coreApi.send({ method: 'GET', path: `forms/${formId}/invitations` }),
    ]);

    if (formResponse.status === 404 || invitationsResponse.status === 404) {
      return { status: 'not_found' };
    }

    if (formResponse.status !== 200 || invitationsResponse.status !== 200) {
      return { status: 'unavailable' };
    }

    const form = formResponse.body as CoreForm;

    const invitation = (invitationsResponse.body as { items: CoreInvitation[] }).items.find(
      ({ id }) => id === invitationId,
    );

    if (!invitation) {
      return { status: 'not_found' };
    }

    // Anônimo: as respostas não estão ligadas à pessoa.
    if (form.anonymous) {
      return { status: 'anonymous' };
    }

    if (invitation.answerChannel !== 'DIGITAL' || !invitation.answeredAt) {
      return { status: 'not_answered' };
    }

    const answers = new Map(invitation.answers.map((answer) => [answer.questionId, answer]));

    const content = await this.printout.render({
      title: form.title,
      description: form.description,
      startsOn: form.startsOn,
      endsOn: form.endsOn,
      recipient: { name: invitation.recipientName, email: invitation.recipientEmail },
      consentText: form.consentText,
      answered: { at: ANSWERED_AT_FORMAT.format(new Date(invitation.answeredAt)) },
      questions: form.questions.map(({ id, options, ...question }) => {
        const answer = answers.get(id);

        const selected = new Set(answer?.optionIds ?? []);

        return {
          ...question,
          answerText: answer?.text ?? null,
          answerValue: answer?.value ?? null,
          options: options.map((option) => ({
            label: option.label,
            selected: selected.has(option.id),
          })),
        };
      }),
    });

    return { status: 'ok', filename: fileNameOf(form.title, invitation.recipientName), content };
  }
}
