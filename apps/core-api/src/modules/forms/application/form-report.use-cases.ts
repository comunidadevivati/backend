import { err, ok, type Result } from '../../../shared/domain/result.js';
import { notFound, type FormsError } from './forms-errors.js';
import type { FormAnswer } from '../domain/form-invitation.js';
import type { FormQuestion, QuestionFieldType, QuestionScale } from '../domain/form.js';
import type { FormInvitationRepository, FormRepository } from './ports.js';

// Relatório consolidado das respostas (ADR 0013): contagens por opção, distribuição da escala,
// estatísticas dos números e a lista de respostas de texto. Em formulário anônimo, as respostas
// vêm da tabela sem vínculo; nos demais, das respostas digitais dos convites. Respostas em papel
// contam na taxa, mas não têm conteúdo (o anexo fica no convite).

interface QuestionReport {
  questionId: string;
  title: string;
  fieldType: QuestionFieldType;
  answeredCount: number;
  options: { id: string; label: string; count: number }[];
  scale: (QuestionScale & { distribution: { value: number; count: number }[] }) | null;
  // Média (escala e número), mínimo e máximo (número).
  average: number | null;
  minimum: number | null;
  maximum: number | null;
  // Respostas de texto e datas (AAAA-MM-DD), em ordem alfabética: nunca na ordem de chegada.
  texts: string[];
}

export interface FormReport {
  anonymous: boolean;
  invitedCount: number;
  digitalCount: number;
  paperCount: number;
  pendingCount: number;
  questions: QuestionReport[];
}

// Uma linha por resposta digital, para a exportação (CSV). Em formulário anônimo, sem identificação e
// só com a data; as linhas saem ordenadas pelo conteúdo, nunca pela ordem de chegada.
interface ResponseRow {
  name: string | null;
  email: string | null;
  answeredAt: string | null;
  submittedOn: string | null;
  answers: FormAnswer[];
}

export interface FormResponses {
  anonymous: boolean;
  questions: FormQuestion[];
  rows: ResponseRow[];
}

const round = (value: number): number => Math.round(value * 100) / 100;

const reportOf = (question: FormQuestion, answers: readonly FormAnswer[]): QuestionReport => {
  const mine = answers.filter(({ questionId }) => questionId === question.id);

  const values = mine.flatMap(({ value }) => (value === null ? [] : [value]));

  const scale = question.scale;

  return {
    questionId: question.id,
    title: question.title,
    fieldType: question.fieldType,
    answeredCount: mine.length,
    options: question.options.map(({ id, label }) => ({
      id,
      label,
      count: mine.filter(({ optionIds }) => optionIds.includes(id)).length,
    })),
    scale:
      question.fieldType === 'SCALE' && scale
        ? {
            ...scale,
            distribution: Array.from({ length: scale.max - scale.min + 1 }, (_, offset) => {
              const value = scale.min + offset;

              return { value, count: values.filter((answer) => answer === value).length };
            }),
          }
        : null,
    average:
      values.length > 0
        ? round(values.reduce((sum, value) => sum + value, 0) / values.length)
        : null,
    minimum: question.fieldType === 'NUMBER' && values.length > 0 ? Math.min(...values) : null,
    maximum: question.fieldType === 'NUMBER' && values.length > 0 ? Math.max(...values) : null,
    texts: mine
      .flatMap(({ text }) => (text ? [text] : []))
      .toSorted((a, b) => a.localeCompare(b, 'pt-BR')),
  };
};

// Respostas digitais do formulário: as anônimas (tabela sem vínculo) ou as dos convites.
const loadAnswers = async (
  invitations: FormInvitationRepository,
  formId: string,
  anonymous: boolean,
) => {
  const all = await invitations.findByForm(formId);

  const snapshots = all.map((invitation) => invitation.toSnapshot());

  const digital = snapshots.filter(({ answerChannel }) => answerChannel === 'DIGITAL');

  const answerSets = anonymous
    ? await invitations.listAnonymousAnswers(formId)
    : digital.map(({ answers }) => answers);

  return { snapshots, digital, answerSets };
};

export class GetFormReportUseCase {
  constructor(
    private readonly forms: FormRepository,
    private readonly invitations: FormInvitationRepository,
  ) {}

  async execute(formId: string): Promise<Result<FormReport, FormsError>> {
    const form = await this.forms.findById(formId);

    if (!form) {
      return err(notFound);
    }

    const { answerSets, digital, snapshots } = await loadAnswers(
      this.invitations,
      formId,
      form.isAnonymous,
    );

    const flat = answerSets.flat();

    const paperCount = snapshots.filter(({ answerChannel }) => answerChannel === 'PAPER').length;

    return ok({
      anonymous: form.isAnonymous,
      invitedCount: snapshots.length,
      digitalCount: digital.length,
      paperCount,
      pendingCount: snapshots.length - digital.length - paperCount,
      questions: form.questions.map((question) => reportOf(question, flat)),
    });
  }
}

export class ListFormResponsesUseCase {
  constructor(
    private readonly forms: FormRepository,
    private readonly invitations: FormInvitationRepository,
  ) {}

  async execute(formId: string): Promise<Result<FormResponses, FormsError>> {
    const form = await this.forms.findById(formId);

    if (!form) {
      return err(notFound);
    }

    const anonymous = form.isAnonymous;

    const { answerSets, digital } = await loadAnswers(this.invitations, formId, anonymous);

    const rows: ResponseRow[] = anonymous
      ? answerSets
          .map((answers) => ({
            name: null,
            email: null,
            answeredAt: null,
            submittedOn: null,
            answers,
          }))
          .toSorted((a, b) => JSON.stringify(a.answers).localeCompare(JSON.stringify(b.answers)))
      : digital
          .map(({ answeredAt, answers, recipientEmail, recipientName }) => ({
            name: recipientName,
            email: recipientEmail,
            answeredAt,
            submittedOn: null,
            answers,
          }))
          .toSorted((a, b) => (a.name ?? '').localeCompare(b.name ?? '', 'pt-BR'));

    return ok({ anonymous, questions: [...form.questions], rows });
  }
}
