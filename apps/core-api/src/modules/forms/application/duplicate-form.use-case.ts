import { err, ok, type Result } from '../../../shared/domain/result.js';
import { FORM_TITLE_MAX_LENGTH } from '../domain/form-details.js';
import { Form, type FormHeaderImage, type FormQuestion } from '../domain/form.js';
import { notFound, ruleError, type FormsError } from './forms-errors.js';
import { headerImageKeys } from './header-image-keys.js';
import type { FormView, FormViews } from './form-views.js';
import type {
  Clock,
  FormImageStorage,
  FormRepository,
  IdGenerator,
  RecipientGroupCatalog,
} from './ports.js';

// Cópia de um formulário (também usada para começar um novo a partir de um modelo): nasce não
// publicado, com perguntas, configurações, grupos ainda existentes e imagem do cabeçalho copiados.
// Convites, respostas e envios não são copiados.
export class DuplicateFormUseCase {
  constructor(
    private readonly forms: FormRepository,
    private readonly views: FormViews,
    private readonly groups: RecipientGroupCatalog,
    private readonly storage: FormImageStorage,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
  ) {}

  async execute(formId: string, titlePrefix: string): Promise<Result<FormView, FormsError>> {
    const source = await this.forms.findById(formId);

    if (!source) {
      return err(notFound);
    }

    const snapshot = source.toSnapshot();

    const id = this.ids.next();

    const questions = snapshot.questions.map((question): FormQuestion => ({
      ...question,
      id: this.ids.next(),
      options: question.options.map(({ label }) => ({ id: this.ids.next(), label })),
    }));

    const existingGroups = new Set(await this.groups.existingIds(snapshot.recipientGroupIds));

    const copy = Form.create(
      id,
      snapshot.department,
      {
        title: `${titlePrefix}${snapshot.title}`.slice(0, FORM_TITLE_MAX_LENGTH),
        description: snapshot.description,
        startsOn: snapshot.startsOn,
        endsOn: snapshot.endsOn,
        questions,
        recipientGroupIds: snapshot.recipientGroupIds.filter((groupId) =>
          existingGroups.has(groupId),
        ),
        anonymous: snapshot.anonymous,
        allowAnswerEdit: snapshot.allowAnswerEdit,
        consentText: snapshot.consentText,
      },
      'DRAFT',
      this.clock.today(),
      this.clock.now().toISOString(),
    );

    if (!copy.ok) {
      return err(ruleError(copy.error));
    }

    const image = await this.copyImage(formId, id, snapshot.headerImage);

    if (image) {
      copy.value.replaceHeaderImage(image);
    }

    await this.forms.insert(copy.value);

    const saved = await this.forms.findById(id);

    return saved ? ok(await this.views.of(saved.toSnapshot())) : err(notFound);
  }

  // A imagem do cabeçalho ganha um objeto próprio no bucket (excluir uma cópia não afeta a outra).
  private async copyImage(
    sourceId: string,
    targetId: string,
    image: FormHeaderImage | null,
  ): Promise<FormHeaderImage | null> {
    if (!image || !this.storage.enabled) {
      return null;
    }

    const body = await this.storage.read(headerImageKeys.image(sourceId, image.key));

    if (!body) {
      return null;
    }

    const key = this.ids.next();

    await this.storage.write(headerImageKeys.image(targetId, key), body, image.contentType);

    return { ...image, key };
  }
}
