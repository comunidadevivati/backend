import { createHash } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { FormInvitationEmailSender } from './form-invitation-email-sender.js';
import { FormPrintout, type PrintoutQuestion } from './form-printout.js';

// Resposta da Core API após registrar as respostas (só o usado na cópia).
interface AnsweredInvitation {
  recipient: { name: string; email: string };
  answeredAt: string | null;
  form: {
    title: string;
    description: string | null;
    startsOn: string;
    endsOn: string;
    consentText: string | null;
    questions: (Omit<PrintoutQuestion, 'options'> & {
      id: string;
      options: { id: string; label: string }[];
    })[];
  };
}

// Respostas enviadas pela pessoa (já validadas pela Core API). Em formulário anônimo, a Core API não
// devolve as respostas: a cópia usa as que foram enviadas nesta requisição.
interface SubmittedAnswers {
  token?: unknown;
  answers?: {
    questionId: string;
    text?: string | null;
    optionIds?: string[];
    value?: number | null;
  }[];
}

const ANSWERED_AT_FORMAT = new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'America/Campo_Grande',
  dateStyle: 'short',
  timeStyle: 'short',
});

// Cópia das respostas por e-mail, em PDF, para quem respondeu pelo link e pediu (ADR 0013).
@Injectable()
export class AnswersCopyService {
  private readonly logger = new Logger(AnswersCopyService.name);

  constructor(
    @Inject(FormPrintout) private readonly printout: FormPrintout,
    @Inject(FormInvitationEmailSender) private readonly sender: FormInvitationEmailSender,
  ) {}

  send(invitation: unknown, submitted: SubmittedAnswers): void {
    void this.deliver(invitation as AnsweredInvitation, submitted).catch((error: unknown) => {
      this.logger.warn(`Cópia das respostas não enviada: ${String(error)}`);
    });
  }

  private async deliver(
    { answeredAt, form, recipient }: AnsweredInvitation,
    submitted: SubmittedAnswers,
  ) {
    if (!this.sender.enabled) {
      return;
    }

    const answers = new Map((submitted.answers ?? []).map((answer) => [answer.questionId, answer]));

    const content = await this.printout.render({
      title: form.title,
      description: form.description,
      startsOn: form.startsOn,
      endsOn: form.endsOn,
      recipient,
      consentText: form.consentText,
      answered: { at: ANSWERED_AT_FORMAT.format(answeredAt ? new Date(answeredAt) : new Date()) },
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

    // Uma cópia por resposta registrada (reenvios da mesma requisição não duplicam o e-mail).
    const key = createHash('sha256')
      .update(`${String(submitted.token)}:${answeredAt ?? ''}`)
      .digest('hex');

    await this.sender.sendAnswersCopy({
      email: recipient.email,
      name: recipient.name,
      formTitle: form.title,
      pdf: { filename: 'minhas-respostas.pdf', content },
      idempotencyKey: `form-answers-copy/${key}`,
    });
  }
}
