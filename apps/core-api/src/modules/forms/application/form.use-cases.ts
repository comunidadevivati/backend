import { err, ok, type Result } from '../../../shared/domain/result.js';
import { buildFormDetails, type FormDetailsInput } from '../domain/form-details.js';
import {
  Form,
  FORM_STATUSES,
  type FormDetails,
  type FormQuestion,
  type FormStatus,
} from '../domain/form.js';
import {
  invalidFields,
  notFound,
  ruleError,
  versionConflict,
  type FormsError,
} from './forms-errors.js';
import { headerImageKeys } from './header-image-keys.js';
import { paperAttachmentKeys } from './paper-answer.use-cases.js';
import type { FormView, FormViews } from './form-views.js';
import type {
  Clock,
  FormImageStorage,
  FormInvitationRepository,
  FormRepository,
  IdGenerator,
  RecipientGroupCatalog,
} from './ports.js';

export interface FormPage {
  items: FormView[];
  nextCursor: string | null;
}

export interface ListFormsQuery {
  department: string;
  status: FormStatus | null;
  cursor: string | null;
  limit: number;
}

export interface CreateFormCommand extends FormDetailsInput {
  department: string;
  status: FormStatus;
}

export interface UpdateFormCommand extends FormDetailsInput {
  id: string;
  version: number;
  status: FormStatus;
}

export interface ChangeFormStatusCommand {
  id: string;
  version: number;
  status: FormStatus;
}

type FormResult = Result<FormView, FormsError>;

// Valida o conteúdo e confere se os grupos destinatários existem (contexto Communication).
const prepareDetails = async (
  input: FormDetailsInput,
  current: readonly FormQuestion[],
  ids: IdGenerator,
  groups: RecipientGroupCatalog,
): Promise<Result<FormDetails, FormsError>> => {
  const details = buildFormDetails(input, current, () => ids.next());

  if (!details.ok) {
    return err(invalidFields(details.error));
  }

  const known = new Set(await groups.existingIds(details.value.recipientGroupIds));

  if (details.value.recipientGroupIds.some((id) => !known.has(id))) {
    return err(invalidFields(['recipientGroupIds']));
  }

  return details;
};

export class ListFormsUseCase {
  constructor(
    private readonly forms: FormRepository,
    private readonly views: FormViews,
  ) {}

  // Paginação por cursor: busca um item a mais para saber se existe a próxima página.
  async execute({ cursor, department, limit, status }: ListFormsQuery): Promise<FormPage> {
    const rows = await this.forms.list({ department, status, after: cursor, limit: limit + 1 });

    const page = rows.slice(0, limit);

    return {
      items: await this.views.ofMany(page),
      nextCursor: rows.length > limit ? (page.at(-1)?.id ?? null) : null,
    };
  }
}

export class GetFormsSummaryUseCase {
  constructor(private readonly forms: FormRepository) {}

  async execute(
    department: string,
  ): Promise<{ total: number; byStatus: Record<FormStatus, number> }> {
    const byStatus = await this.forms.countByStatus(department);

    return {
      total: FORM_STATUSES.reduce((sum, status) => sum + byStatus[status], 0),
      byStatus,
    };
  }
}

export class GetFormUseCase {
  constructor(
    private readonly forms: FormRepository,
    private readonly views: FormViews,
  ) {}

  async execute(id: string): Promise<FormResult> {
    const form = await this.forms.findById(id);

    return form ? ok(await this.views.of(form.toSnapshot())) : err(notFound);
  }
}

// Um formulário novo nasce não publicado ou publicado.
export class CreateFormUseCase {
  constructor(
    private readonly forms: FormRepository,
    private readonly views: FormViews,
    private readonly groups: RecipientGroupCatalog,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
  ) {}

  async execute({ department, status, ...input }: CreateFormCommand): Promise<FormResult> {
    const details = await prepareDetails(input, [], this.ids, this.groups);

    if (!details.ok) {
      return details;
    }

    const form = Form.create(
      this.ids.next(),
      department,
      details.value,
      status,
      this.clock.today(),
      new Date().toISOString(),
    );

    if (!form.ok) {
      return err(ruleError(form.error));
    }

    await this.forms.insert(form.value);

    const saved = await this.forms.findById(form.value.id);

    return saved ? ok(await this.views.of(saved.toSnapshot())) : err(notFound);
  }
}

// Edição completa (conteúdo e status) com controle otimista.
export class UpdateFormUseCase {
  constructor(
    private readonly forms: FormRepository,
    private readonly views: FormViews,
    private readonly groups: RecipientGroupCatalog,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
    private readonly invitations: FormInvitationRepository,
  ) {}

  async execute({ id, status, version, ...input }: UpdateFormCommand): Promise<FormResult> {
    const form = await this.forms.findById(id);

    if (!form) {
      return err(notFound);
    }

    if (form.version !== version) {
      return err(versionConflict);
    }

    if (form.isSendingEmails(this.clock.now())) {
      return err(ruleError('emails_sending'));
    }

    if (form.isClosed) {
      return err(ruleError('form_closed'));
    }

    const details = await prepareDetails(input, form.questions, this.ids, this.groups);

    if (!details.ok) {
      return details;
    }

    // Depois da primeira resposta, o anonimato não muda: as respostas já gravadas seguem o modo em
    // que foram dadas.
    if (details.value.anonymous !== form.isAnonymous && (await this.hasAnswers(id))) {
      return err({ type: 'anonymity_locked' });
    }

    const updated = form.update(details.value, status, this.clock.today());

    if (!updated.ok) {
      return err(ruleError(updated.error));
    }

    const saved = await this.forms.update(form);

    return saved ? ok(await this.views.of(saved)) : err(versionConflict);
  }

  private async hasAnswers(formId: string): Promise<boolean> {
    return ((await this.invitations.statsByForms([formId])).get(formId)?.answeredCount ?? 0) > 0;
  }
}

// Publicar, despublicar, concluir ou cancelar sem reenviar o conteúdo.
export class ChangeFormStatusUseCase {
  constructor(
    private readonly forms: FormRepository,
    private readonly views: FormViews,
    private readonly clock: Clock,
  ) {}

  async execute({ id, status, version }: ChangeFormStatusCommand): Promise<FormResult> {
    const form = await this.forms.findById(id);

    if (!form) {
      return err(notFound);
    }

    if (form.version !== version) {
      return err(versionConflict);
    }

    if (form.isSendingEmails(this.clock.now())) {
      return err(ruleError('emails_sending'));
    }

    const changed = form.changeStatus(status, this.clock.today());

    if (!changed.ok) {
      return err(ruleError(changed.error));
    }

    const saved = await this.forms.update(form);

    return saved ? ok(await this.views.of(saved)) : err(versionConflict);
  }
}

// Exclusão definitiva, inclusive da imagem do cabeçalho.
export class DeleteFormUseCase {
  constructor(
    private readonly forms: FormRepository,
    private readonly storage: FormImageStorage,
    private readonly clock: Clock,
    private readonly invitations: FormInvitationRepository,
  ) {}

  async execute(id: string): Promise<Result<void, FormsError>> {
    const form = await this.forms.findById(id);

    if (!form) {
      return err(notFound);
    }

    if (form.isSendingEmails(this.clock.now())) {
      return err(ruleError('emails_sending'));
    }

    if (!form.canBeDeleted) {
      return err(ruleError('published_form'));
    }

    // Anexos das respostas em papel saem do bucket junto (os convites saem em cascata no banco).
    const attachments = paperAttachmentKeys(await this.invitations.findByForm(id));

    await this.forms.delete(id);

    const image = form.headerImage;

    const keys = [...(image ? [headerImageKeys.image(id, image.key)] : []), ...attachments];

    if (keys.length > 0 && this.storage.enabled) {
      await this.storage.delete(keys);
    }

    return ok();
  }
}
