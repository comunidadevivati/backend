import { err, ok, type Result } from '../../../shared/domain/result.js';
import { isCivilDate } from './form-details.js';
import { isChoiceFieldType, type FormQuestion } from './form.js';

const INPUT_ANSWER_MAX_LENGTH = 500;

const TEXTAREA_ANSWER_MAX_LENGTH = 5000;

export type InvitationStatus = 'PENDING' | 'ANSWERED';

// DIGITAL: respondido pelo link. PAPER: marcado no painel (versão impressa), com anexo opcional.
export type AnswerChannel = 'DIGITAL' | 'PAPER';

// Formulário preenchido à mão e digitalizado (PDF, JPEG ou PNG), na área privada do bucket.
export interface PaperAttachment {
  key: string;
  fileName: string;
  contentType: string;
  byteSize: number;
}

export type InvitationRuleError = 'already_answered' | 'not_paper_answer';

// Situação de entrega do e-mail do convite (envio pelo BFF e eventos do webhook do Resend).
export const DELIVERY_STATUSES = [
  'SENT',
  'DELAYED',
  'DELIVERED',
  'OPENED',
  'CLICKED',
  'BOUNCED',
  'COMPLAINED',
  'FAILED',
] as const;

export type DeliveryStatus = (typeof DELIVERY_STATUSES)[number];

// Ordem de avanço: um evento atrasado (ex.: "entregue" depois de "aberto") não faz voltar. Devolvido,
// spam e falha sempre prevalecem.
const DELIVERY_RANK: Record<DeliveryStatus, number> = {
  SENT: 1,
  DELAYED: 2,
  DELIVERED: 3,
  OPENED: 4,
  CLICKED: 5,
  BOUNCED: 10,
  COMPLAINED: 10,
  FAILED: 10,
};

// Resposta a uma pergunta: texto (INPUT, TEXTAREA) ou opções marcadas (CHECKBOX, RADIO).
const NUMBER_ANSWER_LIMIT = 1_000_000_000;

// Resposta a uma pergunta: texto (INPUT, TEXTAREA, DATE em AAAA-MM-DD), opções marcadas (CHECKBOX,
// RADIO, SELECT) ou valor (SCALE, NUMBER).
export interface FormAnswer {
  questionId: string;
  text: string | null;
  optionIds: string[];
  value: number | null;
}

export interface FormInvitationSnapshot {
  id: string;
  formId: string;
  // Conta do BFF convidada; nome e e-mail são os do momento do envio (exibidos na resposta).
  accountId: string;
  recipientName: string;
  recipientEmail: string;
  // Somente o hash do token do link vai para o banco.
  tokenHash: string;
  status: InvitationStatus;
  sentAt: string;
  answeredAt: string | null;
  answerChannel: AnswerChannel | null;
  answers: FormAnswer[];
  paperAttachment: PaperAttachment | null;
  emailMessageId: string | null;
  deliveryStatus: DeliveryStatus | null;
  deliveryUpdatedAt: string | null;
  version: number;
}

export interface AnswerInput {
  questionId: string;
  text?: string | null | undefined;
  optionIds?: string[] | undefined;
  value?: number | null | undefined;
}

type QuestionAnswer = { answer: FormAnswer | null; valid: boolean };

const textAnswer = (
  questionId: string,
  { optionIds = [], text, value }: AnswerInput,
  max: number,
  format?: (value: string) => boolean,
): QuestionAnswer => {
  const trimmed = text?.trim() ?? '';

  const valid =
    trimmed.length <= max &&
    optionIds.length === 0 &&
    (value ?? null) === null &&
    (trimmed === '' || !format || format(trimmed));

  return {
    valid,
    answer: trimmed === '' ? null : { questionId, text: trimmed, optionIds: [], value: null },
  };
};

const choiceAnswer = (question: FormQuestion, { optionIds = [], text, value }: AnswerInput) => {
  const unique = [...new Set(optionIds)];

  const known = new Set(question.options.map(({ id }) => id));

  const valid =
    unique.every((id) => known.has(id)) &&
    (question.fieldType === 'CHECKBOX' || unique.length <= 1) &&
    (text ?? '') === '' &&
    (value ?? null) === null;

  return {
    valid,
    answer:
      unique.length === 0
        ? null
        : { questionId: question.id, text: null, optionIds: unique, value: null },
  };
};

const valueAnswer = (question: FormQuestion, { optionIds = [], text, value }: AnswerInput) => {
  const scale = question.scale;

  const inRange =
    value === null ||
    value === undefined ||
    (question.fieldType === 'SCALE'
      ? Number.isInteger(value) && scale !== null && value >= scale.min && value <= scale.max
      : Number.isFinite(value) && Math.abs(value) <= NUMBER_ANSWER_LIMIT);

  return {
    valid: inRange && optionIds.length === 0 && (text ?? '') === '',
    answer:
      value === null || value === undefined
        ? null
        : { questionId: question.id, text: null, optionIds: [], value },
  };
};

const answerOf = (question: FormQuestion, input: AnswerInput): QuestionAnswer => {
  switch (question.fieldType) {
    case 'INPUT':
      return textAnswer(question.id, input, INPUT_ANSWER_MAX_LENGTH);

    case 'TEXTAREA':
      return textAnswer(question.id, input, TEXTAREA_ANSWER_MAX_LENGTH);

    case 'DATE':
      return textAnswer(question.id, input, 10, isCivilDate);

    case 'SCALE':

    case 'NUMBER':
      return valueAnswer(question, input);

    default:
      return isChoiceFieldType(question.fieldType)
        ? choiceAnswer(question, input)
        : { valid: false, answer: null };
  }
};

// Valida as respostas contra as perguntas atuais: perguntas obrigatórias precisam de resposta e, sem
// nenhuma obrigatória, ao menos uma pergunta precisa ser respondida. Com texto de consentimento, o
// aceite é obrigatório. Devolve as respostas na ordem das perguntas e os campos recusados no formato
// answers.<índice da pergunta> (ou "consent").
export const buildAnswers = (
  questions: readonly FormQuestion[],
  input: readonly AnswerInput[],
  consent: { required: boolean; accepted: boolean } = { required: false, accepted: false },
): Result<FormAnswer[], string[]> => {
  const byQuestion = new Map(input.map((answer) => [answer.questionId, answer]));

  const fields: string[] = [];

  if (input.some(({ questionId }) => !questions.some(({ id }) => id === questionId))) {
    fields.push('answers');
  }

  if (consent.required && !consent.accepted) {
    fields.push('consent');
  }

  const answers = questions.flatMap((question, index): FormAnswer[] => {
    const { answer, valid } = answerOf(question, byQuestion.get(question.id) ?? { questionId: '' });

    if (!valid || (question.required && !answer)) {
      fields.push(`answers.${index}`);
    }

    return answer ? [answer] : [];
  });

  if (fields.length === 0 && answers.length === 0) {
    fields.push('answers');
  }

  return fields.length > 0 ? err(fields) : ok(answers);
};

// Convite de uma conta para responder um formulário (ADR 0013), com a resposta digital. Uma resposta
// por convite; reenviar o e-mail troca o token (o link anterior deixa de valer).
export class FormInvitation {
  private constructor(private state: FormInvitationSnapshot) {}

  static create(
    id: string,
    formId: string,
    recipient: { accountId: string; name: string; email: string },
    tokenHash: string,
    now: string,
  ): FormInvitation {
    return new FormInvitation({
      id,
      formId,
      accountId: recipient.accountId,
      recipientName: recipient.name,
      recipientEmail: recipient.email,
      tokenHash,
      status: 'PENDING',
      sentAt: now,
      answeredAt: null,
      answerChannel: null,
      answers: [],
      paperAttachment: null,
      emailMessageId: null,
      deliveryStatus: null,
      deliveryUpdatedAt: null,
      version: 1,
    });
  }

  static restore(snapshot: FormInvitationSnapshot): FormInvitation {
    return new FormInvitation(structuredClone(snapshot));
  }

  get accountId(): string {
    return this.state.accountId;
  }

  get isAnswered(): boolean {
    return this.state.status === 'ANSWERED';
  }

  // Novo envio: token novo e dados atuais da conta.
  resend(recipient: { name: string; email: string }, tokenHash: string, now: string): void {
    this.state = {
      ...this.state,
      recipientName: recipient.name,
      recipientEmail: recipient.email,
      tokenHash,
      sentAt: now,
    };
  }

  get id(): string {
    return this.state.id;
  }

  get paperAttachment(): PaperAttachment | null {
    return this.state.paperAttachment;
  }

  get answerChannel(): AnswerChannel | null {
    return this.state.answerChannel;
  }

  // Resposta digital. Com edição permitida, quem já respondeu pelo link pode substituir a resposta;
  // resposta em papel nunca é substituída pelo link.
  answer(answers: FormAnswer[], now: string, allowEdit = false): Result<void, 'already_answered'> {
    if (this.isAnswered && !(allowEdit && this.state.answerChannel === 'DIGITAL')) {
      return err('already_answered');
    }

    this.state = {
      ...this.state,
      status: 'ANSWERED',
      answeredAt: now,
      answerChannel: 'DIGITAL',
      answers,
    };

    return ok();
  }

  // Resultado do envio pelo BFF: um novo envio recomeça a situação de entrega.
  recordSend(messageId: string | null, sent: boolean, now: string): void {
    this.state = {
      ...this.state,
      emailMessageId: messageId,
      deliveryStatus: sent ? 'SENT' : 'FAILED',
      deliveryUpdatedAt: now,
    };
  }

  // Evento do webhook; ignorado quando não faz a situação avançar.
  recordDeliveryEvent(status: DeliveryStatus, at: string): boolean {
    const current = this.state.deliveryStatus;

    if (current && DELIVERY_RANK[status] < DELIVERY_RANK[current]) {
      return false;
    }

    this.state = { ...this.state, deliveryStatus: status, deliveryUpdatedAt: at };

    return true;
  }

  // Apaga o conteúdo da resposta (LGPD) e devolve o anexo, para apagar do bucket.
  purgeAnswer(): PaperAttachment | null {
    const previous = this.state.paperAttachment;

    this.state = { ...this.state, answers: [], paperAttachment: null };

    return previous;
  }

  // Formulário anônimo: o convite só registra que houve resposta; as respostas são guardadas à
  // parte, sem vínculo com a pessoa.
  answerAnonymously(now: string): Result<void, 'already_answered'> {
    return this.answer([], now);
  }

  // Resposta em papel: marca como respondido (ou mantém, se já era em papel) e troca o anexo quando
  // informado. Devolve o anexo substituído, para apagar do bucket.
  markPaperAnswer(
    now: string,
    attachment: PaperAttachment | null,
  ): Result<PaperAttachment | null, InvitationRuleError> {
    if (this.state.answerChannel === 'DIGITAL') {
      return err('already_answered');
    }

    const previous = attachment ? this.state.paperAttachment : null;

    this.state = {
      ...this.state,
      status: 'ANSWERED',
      answerChannel: 'PAPER',
      answeredAt: this.state.answeredAt ?? now,
      paperAttachment: attachment ?? this.state.paperAttachment,
    };

    return ok(previous);
  }

  // Desfaz a marcação em papel (engano): volta a pendente e devolve o anexo, para apagar do bucket.
  unmarkPaperAnswer(): Result<PaperAttachment | null, InvitationRuleError> {
    if (this.state.answerChannel !== 'PAPER') {
      return err('not_paper_answer');
    }

    const previous = this.state.paperAttachment;

    this.state = {
      ...this.state,
      status: 'PENDING',
      answerChannel: null,
      answeredAt: null,
      paperAttachment: null,
    };

    return ok(previous);
  }

  toSnapshot(): FormInvitationSnapshot {
    return structuredClone(this.state);
  }
}
