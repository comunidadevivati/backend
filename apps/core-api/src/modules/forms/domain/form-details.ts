import { err, ok, type Result } from '../../../shared/domain/result.js';
import {
  isChoiceFieldType,
  type FormDetails,
  type FormQuestion,
  type QuestionFieldType,
  type QuestionScale,
} from './form.js';

// Limites do formulário (o frontend aplica os mesmos).
export const FORM_TITLE_MAX_LENGTH = 120;

export const FORM_DESCRIPTION_MAX_LENGTH = 2000;

export const QUESTION_TITLE_MAX_LENGTH = 200;

export const QUESTION_DESCRIPTION_MAX_LENGTH = 500;

export const MAX_QUESTIONS = 50;

// Checkbox, radio e lista: de 1 a 20 opções com rótulos distintos (uma só serve para "concordo").
export const MIN_QUESTION_OPTIONS = 1;

export const MAX_QUESTION_OPTIONS = 20;

export const QUESTION_OPTION_MAX_LENGTH = 100;

export const MAX_RECIPIENT_GROUPS = 50;

// Escala: começa em 0 ou 1 e vai até 2..10; rótulos das pontas com até 40 caracteres.
export const SCALE_MAX_VALUE = 10;

export const SCALE_LABEL_MAX_LENGTH = 40;

export const CONSENT_TEXT_MAX_LENGTH = 1000;

export interface QuestionInput {
  // null cria uma pergunta nova; um ID da própria pergunta a mantém.
  id: string | null;
  title: string;
  description: string | null;
  fieldType: QuestionFieldType;
  required: boolean;
  options: { id: string | null; label: string }[];
  scale: {
    min: number;
    max: number;
    minLabel: string | null;
    maxLabel: string | null;
    pointLabels: string[] | null;
  } | null;
}

export interface FormDetailsInput {
  title: string;
  description: string | null;
  startsOn: string;
  endsOn: string;
  questions: QuestionInput[];
  recipientGroupIds: string[];
  anonymous: boolean;
  allowAnswerEdit: boolean;
  consentText: string | null;
}

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/u;

// Data civil existente no formato AAAA-MM-DD.
export const isCivilDate = (value: string): boolean => {
  const match = ISO_DATE.exec(value);

  if (!match) {
    return false;
  }

  const [, year, month, day] = match.map(Number) as [number, number, number, number];

  const date = new Date(Date.UTC(year, month - 1, day));

  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  );
};

const optionalText = (value: string | null): string | null => value?.trim() || null;

const tooLong = (value: string | null, max: number): boolean =>
  value !== null && value.length > max;

const hasDuplicates = (labels: readonly string[]): boolean => {
  const normalized = labels.map((label) => label.toLocaleLowerCase('pt-BR'));

  return new Set(normalized).size !== normalized.length;
};

// Escala válida (somente no tipo SCALE) ou null; undefined quando recusada.
const buildScale = (
  fieldType: QuestionFieldType,
  scale: QuestionInput['scale'],
): QuestionScale | null | undefined => {
  if (fieldType !== 'SCALE') {
    return scale === null ? null : undefined;
  }

  if (!scale) {
    return undefined;
  }

  const pointLabels = scale.pointLabels?.map((label) => label.trim()) ?? null;

  // Com nomes por ponto, as pontas repetem o primeiro e o último (PDF e telas que só usam as pontas).
  const minLabel = pointLabels ? (pointLabels[0] ?? null) : optionalText(scale.minLabel);

  const maxLabel = pointLabels ? (pointLabels.at(-1) ?? null) : optionalText(scale.maxLabel);

  const validPoints =
    pointLabels === null ||
    (pointLabels.length === scale.max - scale.min + 1 &&
      pointLabels.every((label) => label !== '' && label.length <= SCALE_LABEL_MAX_LENGTH) &&
      !hasDuplicates(pointLabels));

  const valid =
    (scale.min === 0 || scale.min === 1) &&
    Number.isInteger(scale.max) &&
    scale.max >= scale.min + 1 &&
    scale.max <= SCALE_MAX_VALUE &&
    !tooLong(minLabel, SCALE_LABEL_MAX_LENGTH) &&
    !tooLong(maxLabel, SCALE_LABEL_MAX_LENGTH) &&
    validPoints;

  return valid ? { min: scale.min, max: scale.max, minLabel, maxLabel, pointLabels } : undefined;
};

const buildQuestion = (
  question: QuestionInput,
  index: number,
  current: ReadonlyMap<string, FormQuestion>,
  nextId: () => string,
  fields: string[],
): FormQuestion => {
  const title = question.title.trim();

  const description = optionalText(question.description);

  const labels = question.options.map(({ label }) => label.trim());

  if (title === '' || title.length > QUESTION_TITLE_MAX_LENGTH) {
    fields.push(`questions.${index}.title`);
  }

  if (tooLong(description, QUESTION_DESCRIPTION_MAX_LENGTH)) {
    fields.push(`questions.${index}.description`);
  }

  labels.forEach((label, optionIndex) => {
    if (label === '' || label.length > QUESTION_OPTION_MAX_LENGTH) {
      fields.push(`questions.${index}.options.${optionIndex}.label`);
    }
  });

  const optionsAccepted = isChoiceFieldType(question.fieldType)
    ? labels.length >= MIN_QUESTION_OPTIONS &&
      labels.length <= MAX_QUESTION_OPTIONS &&
      !hasDuplicates(labels)
    : labels.length === 0;

  if (!optionsAccepted) {
    fields.push(`questions.${index}.options`);
  }

  const scale = buildScale(question.fieldType, question.scale);

  if (scale === undefined) {
    fields.push(`questions.${index}.scale`);
  }

  const existing = question.id ? current.get(question.id) : undefined;

  const existingOptions = new Set(existing?.options.map(({ id }) => id));

  return {
    id: existing?.id ?? nextId(),
    title,
    description,
    fieldType: question.fieldType,
    required: question.required,
    options: question.options.map(({ id }, optionIndex) => ({
      id: id && existingOptions.has(id) ? id : nextId(),
      label: labels[optionIndex] ?? '',
    })),
    scale: scale ?? null,
  };
};

// Valida o conteúdo e atribui IDs às perguntas e opções novas. IDs desconhecidos (que não são da
// própria pergunta ou opção atual) também geram IDs novos. Devolve os campos recusados no formato de
// caminho do contrato (ex.: questions.0.options).
export const buildFormDetails = (
  input: FormDetailsInput,
  current: readonly FormQuestion[],
  nextId: () => string,
): Result<FormDetails, string[]> => {
  const fields: string[] = [];

  const title = input.title.trim();

  const description = optionalText(input.description);

  const consentText = optionalText(input.consentText);

  if (title === '' || title.length > FORM_TITLE_MAX_LENGTH) {
    fields.push('title');
  }

  if (tooLong(description, FORM_DESCRIPTION_MAX_LENGTH)) {
    fields.push('description');
  }

  const validStart = isCivilDate(input.startsOn);

  const validEnd = isCivilDate(input.endsOn);

  if (!validStart) {
    fields.push('startsOn');
  }

  if (!validEnd || (validStart && input.endsOn < input.startsOn)) {
    fields.push('endsOn');
  }

  if (input.questions.length === 0 || input.questions.length > MAX_QUESTIONS) {
    fields.push('questions');
  }

  const recipientGroupIds = [...new Set(input.recipientGroupIds.map((id) => id.toLowerCase()))];

  if (recipientGroupIds.length > MAX_RECIPIENT_GROUPS) {
    fields.push('recipientGroupIds');
  }

  // Resposta anônima não pode ser localizada depois para edição.
  if (input.anonymous && input.allowAnswerEdit) {
    fields.push('allowAnswerEdit');
  }

  if (tooLong(consentText, CONSENT_TEXT_MAX_LENGTH)) {
    fields.push('consentText');
  }

  const currentById = new Map(current.map((question) => [question.id, question]));

  const questions = input.questions.map((question, index) =>
    buildQuestion(question, index, currentById, nextId, fields),
  );

  if (fields.length > 0) {
    return err(fields);
  }

  return ok({
    title,
    description,
    startsOn: input.startsOn,
    endsOn: input.endsOn,
    questions,
    recipientGroupIds,
    anonymous: input.anonymous,
    allowAnswerEdit: input.allowAnswerEdit,
    consentText,
  });
};
