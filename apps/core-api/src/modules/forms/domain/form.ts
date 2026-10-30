import { err, ok, type Result } from '../../../shared/domain/result.js';

// DRAFT = não publicado. FINISHED e CANCELLED são finais: o formulário não muda mais.
export const FORM_STATUSES = ['DRAFT', 'PUBLISHED', 'FINISHED', 'CANCELLED'] as const;

export type FormStatus = (typeof FORM_STATUSES)[number];

// Texto curto, texto longo, múltipla escolha (checkbox), escolha única (radio), lista suspensa
// (select, escolha única), escala numérica (ex.: 1 a 5), data e número.
export const QUESTION_FIELD_TYPES = [
  'INPUT',
  'TEXTAREA',
  'CHECKBOX',
  'RADIO',
  'SELECT',
  'SCALE',
  'DATE',
  'NUMBER',
] as const;

export type QuestionFieldType = (typeof QUESTION_FIELD_TYPES)[number];

// Tipos com lista de opções.
export const isChoiceFieldType = (fieldType: QuestionFieldType): boolean =>
  fieldType === 'CHECKBOX' || fieldType === 'RADIO' || fieldType === 'SELECT';

// Escala de min a max (0 ou 1 até 2..10), com rótulos opcionais nas pontas ou um nome para cada
// ponto (ex.: Péssimo, Ruim, Regular, Bom, Ótimo).
export interface QuestionScale {
  min: number;
  max: number;
  minLabel: string | null;
  maxLabel: string | null;
  // Um nome por ponto, na ordem de min a max; com eles, as pontas repetem o primeiro e o último.
  pointLabels: string[] | null;
}

// Departamentos com formulários: catálogo governado por código (ADR 0013).
export const FORM_DEPARTMENTS = ['leadership'] as const;

export const isFormDepartment = (value: string): value is (typeof FORM_DEPARTMENTS)[number] =>
  (FORM_DEPARTMENTS as readonly string[]).includes(value);

export interface QuestionOption {
  id: string;
  label: string;
}

export interface FormQuestion {
  id: string;
  title: string;
  description: string | null;
  fieldType: QuestionFieldType;
  // Obrigatória: a resposta digital não é aceita sem ela.
  required: boolean;
  // Somente nos tipos de escolha; vazio nos demais.
  options: QuestionOption[];
  // Somente no tipo SCALE.
  scale: QuestionScale | null;
}

// Imagem do cabeçalho já processada (WebP, sem metadados) na área privada do bucket.
export interface FormHeaderImage {
  key: string;
  width: number;
  height: number;
  contentType: string;
  byteSize: number;
}

// Conteúdo editável do formulário, já validado (ver form-details.ts).
export interface FormDetails {
  title: string;
  description: string | null;
  // Datas civis ISO (AAAA-MM-DD): o formulário vale do início ao fim, inclusive.
  startsOn: string;
  endsOn: string;
  questions: FormQuestion[];
  recipientGroupIds: string[];
  // Anônimo: o painel mostra quem respondeu, nunca o que cada pessoa respondeu.
  anonymous: boolean;
  // Quem respondeu pelo link pode alterar a resposta até o fim do período (não vale para anônimo).
  allowAnswerEdit: boolean;
  // Texto de consentimento (LGPD) que precisa ser aceito antes de responder; null dispensa.
  consentText: string | null;
}

export type EmailDispatchStatus = 'SENDING' | 'SENT' | 'FAILED';

// Último envio dos e-mails do formulário aos grupos (feito pelo BFF, que conhece os endereços).
// INVITE: convite (novos e pendentes recebem link). REMINDER: lembrete só aos pendentes.
export type EmailDispatchKind = 'INVITE' | 'REMINDER';

export interface EmailDispatch {
  id: string;
  kind: EmailDispatchKind;
  status: EmailDispatchStatus;
  startedAt: string;
  finishedAt: string | null;
  sentCount: number;
  failedCount: number;
}

// Envio parado em SENDING por mais que isto (BFF reiniciado no meio) deixa de bloquear o formulário.
export const EMAIL_DISPATCH_TIMEOUT_MS = 15 * 60 * 1000;

export interface FormSnapshot extends FormDetails {
  id: string;
  department: string;
  status: FormStatus;
  headerImage: FormHeaderImage | null;
  emailDispatch: EmailDispatch | null;
  // Respostas apagadas (LGPD): o conteúdo saiu; a participação continua registrada.
  answersPurgedAt: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
}

// Situação efetiva do envio: SENDING abandonado conta como FAILED.
export const effectiveEmailDispatch = (
  dispatch: EmailDispatch | null,
  now: Date,
): EmailDispatch | null => {
  if (dispatch?.status !== 'SENDING') {
    return dispatch;
  }

  const abandoned = now.getTime() - Date.parse(dispatch.startedAt) > EMAIL_DISPATCH_TIMEOUT_MS;

  return abandoned ? { ...dispatch, status: 'FAILED' } : dispatch;
};

// Transições permitidas a partir de cada status (sem contar permanecer no mesmo).
const TRANSITIONS: Record<FormStatus, readonly FormStatus[]> = {
  DRAFT: ['PUBLISHED', 'CANCELLED'],
  PUBLISHED: ['DRAFT', 'FINISHED', 'CANCELLED'],
  FINISHED: [],
  CANCELLED: [],
};

export const INITIAL_FORM_STATUSES: readonly FormStatus[] = ['DRAFT', 'PUBLISHED'];

export type FormRuleError =
  | 'form_closed'
  | 'invalid_status_transition'
  | 'recipients_required'
  | 'form_period_ended'
  | 'published_form'
  | 'form_not_published'
  | 'emails_sending'
  | 'dispatch_not_found';

// Publicar exige destinatários e um período que ainda não terminou.
const checkPublication = (
  { endsOn, recipientGroupIds }: FormDetails,
  today: string,
): FormRuleError | null => {
  if (recipientGroupIds.length === 0) {
    return 'recipients_required';
  }

  return endsOn < today ? 'form_period_ended' : null;
};

// Formulário de um departamento (pesquisa, avaliação de desempenho...), ADR 0013. As perguntas e as
// opções são Value Objects do Aggregate, com IDs estáveis entre edições.
export class Form {
  private constructor(private state: FormSnapshot) {}

  static create(
    id: string,
    department: string,
    details: FormDetails,
    status: FormStatus,
    today: string,
    now: string,
  ): Result<Form, FormRuleError> {
    if (!INITIAL_FORM_STATUSES.includes(status)) {
      return err('invalid_status_transition');
    }

    const publication = status === 'PUBLISHED' ? checkPublication(details, today) : null;

    if (publication) {
      return err(publication);
    }

    return ok(
      new Form({
        id,
        department,
        ...details,
        status,
        headerImage: null,
        emailDispatch: null,
        answersPurgedAt: null,
        version: 1,
        createdAt: now,
        updatedAt: now,
      }),
    );
  }

  static restore(snapshot: FormSnapshot): Form {
    return new Form(structuredClone(snapshot));
  }

  get id(): string {
    return this.state.id;
  }

  get version(): number {
    return this.state.version;
  }

  get status(): FormStatus {
    return this.state.status;
  }

  get headerImage(): FormHeaderImage | null {
    return this.state.headerImage;
  }

  get questions(): readonly FormQuestion[] {
    return this.state.questions;
  }

  get isAnonymous(): boolean {
    return this.state.anonymous;
  }

  get allowsAnswerEdit(): boolean {
    return this.state.allowAnswerEdit;
  }

  get consentText(): string | null {
    return this.state.consentText;
  }

  get isClosed(): boolean {
    return this.state.status === 'FINISHED' || this.state.status === 'CANCELLED';
  }

  // Publicado já foi divulgado: antes de excluir, é preciso despublicar, concluir ou cancelar.
  get canBeDeleted(): boolean {
    return this.state.status !== 'PUBLISHED';
  }

  // Edição completa (conteúdo e status); status final não muda mais.
  update(details: FormDetails, status: FormStatus, today: string): Result<void, FormRuleError> {
    const transition = this.checkTransition(status);

    if (transition) {
      return err(transition);
    }

    const publication = status === 'PUBLISHED' ? checkPublication(details, today) : null;

    if (publication) {
      return err(publication);
    }

    this.state = { ...this.state, ...details, status };

    return ok();
  }

  // Mudança só de status (publicar, despublicar, concluir, cancelar).
  changeStatus(status: FormStatus, today: string): Result<void, FormRuleError> {
    if (status === this.state.status) {
      return err(this.isClosed ? 'form_closed' : 'invalid_status_transition');
    }

    return this.update(this.details(), status, today);
  }

  replaceHeaderImage(image: FormHeaderImage): Result<FormHeaderImage | null, 'form_closed'> {
    if (this.isClosed) {
      return err('form_closed');
    }

    const previous = this.state.headerImage;

    this.state = { ...this.state, headerImage: image };

    return ok(previous);
  }

  removeHeaderImage(): Result<FormHeaderImage | null, 'form_closed'> {
    if (this.isClosed) {
      return err('form_closed');
    }

    const previous = this.state.headerImage;

    this.state = { ...this.state, headerImage: null };

    return ok(previous);
  }

  // Enquanto os e-mails são enviados, o formulário não aceita nenhuma alteração.
  isSendingEmails(now: Date): boolean {
    return effectiveEmailDispatch(this.state.emailDispatch, now)?.status === 'SENDING';
  }

  // Envio aos grupos: somente formulário publicado, com destinatários e período não encerrado.
  startEmailDispatch(
    dispatchId: string,
    kind: EmailDispatchKind,
    now: Date,
    today: string,
  ): Result<void, FormRuleError> {
    if (this.state.status !== 'PUBLISHED') {
      return err('form_not_published');
    }

    // Lembrete só depois de um primeiro envio.
    if (kind === 'REMINDER' && !this.state.emailDispatch) {
      return err('invalid_status_transition');
    }

    if (this.isSendingEmails(now)) {
      return err('emails_sending');
    }

    const publication = checkPublication(this.details(), today);

    if (publication) {
      return err(publication);
    }

    this.state = {
      ...this.state,
      emailDispatch: {
        id: dispatchId,
        kind,
        status: 'SENDING',
        startedAt: now.toISOString(),
        finishedAt: null,
        sentCount: 0,
        failedCount: 0,
      },
    };

    return ok();
  }

  // Conclusão informada pelo BFF; só vale para o envio em andamento com o mesmo ID.
  finishEmailDispatch(
    dispatchId: string,
    result: { sentCount: number; failedCount: number },
    now: Date,
  ): Result<void, 'dispatch_not_found'> {
    const dispatch = this.state.emailDispatch;

    if (dispatch?.id !== dispatchId || dispatch.status !== 'SENDING') {
      return err('dispatch_not_found');
    }

    this.state = {
      ...this.state,
      emailDispatch: {
        ...dispatch,
        status: result.sentCount > 0 || result.failedCount === 0 ? 'SENT' : 'FAILED',
        finishedAt: now.toISOString(),
        ...result,
      },
    };

    return ok();
  }

  get emailDispatchKind(): EmailDispatchKind | null {
    return this.state.emailDispatch?.kind ?? null;
  }

  // Apaga o conteúdo das respostas (LGPD): só com o formulário finalizado ou cancelado.
  purgeAnswers(now: Date): Result<void, 'form_not_closed'> {
    if (!this.isClosed) {
      return err('form_not_closed');
    }

    this.state = { ...this.state, answersPurgedAt: now.toISOString() };

    return ok();
  }

  isDispatching(dispatchId: string, now: Date): boolean {
    return this.isSendingEmails(now) && this.state.emailDispatch?.id === dispatchId;
  }

  toSnapshot(): FormSnapshot {
    return structuredClone(this.state);
  }

  private details(): FormDetails {
    const {
      allowAnswerEdit,
      anonymous,
      consentText,
      description,
      endsOn,
      questions,
      recipientGroupIds,
      startsOn,
      title,
    } = this.state;

    return {
      title,
      description,
      startsOn,
      endsOn,
      questions,
      recipientGroupIds,
      anonymous,
      allowAnswerEdit,
      consentText,
    };
  }

  private checkTransition(status: FormStatus): FormRuleError | null {
    if (this.isClosed) {
      return 'form_closed';
    }

    if (status !== this.state.status && !TRANSITIONS[this.state.status].includes(status)) {
      return 'invalid_status_transition';
    }

    return null;
  }
}
