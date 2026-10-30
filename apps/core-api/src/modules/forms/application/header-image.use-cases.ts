import { err, ok, type Result } from '../../../shared/domain/result.js';
import {
  invalidImage,
  notFound,
  ruleError,
  storageDisabled,
  uploadMissing,
  uploadTooLarge,
  versionConflict,
  type FormsError,
} from './forms-errors.js';
import { headerImageKeys } from './header-image-keys.js';
import type { FormView, FormViews } from './form-views.js';
import type {
  Clock,
  FormImageStorage,
  FormRepository,
  HeaderImageProcessor,
  IdGenerator,
} from './ports.js';

// Imagem do cabeçalho: PNG, JPEG ou WebP de até 2 MB, qualquer resolução (ADR 0013).
export const HEADER_IMAGE_CONTENT_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const;

type HeaderImageContentType = (typeof HEADER_IMAGE_CONTENT_TYPES)[number];

const MAX_HEADER_IMAGE_BYTES = 2 * 1024 * 1024;

const UPLOAD_URL_TTL_SECONDS = 10 * 60;

export interface HeaderImageUploadTicket {
  uploadId: string;
  uploadUrl: string;
  // O navegador envia com este Content-Type (assinado na URL).
  contentType: HeaderImageContentType;
  expiresAt: string;
}

type FormResult = Result<FormView, FormsError>;

export class RequestHeaderImageUploadUseCase {
  constructor(
    private readonly forms: FormRepository,
    private readonly storage: FormImageStorage,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
  ) {}

  async execute(
    formId: string,
    contentType: HeaderImageContentType,
  ): Promise<Result<HeaderImageUploadTicket, FormsError>> {
    if (!this.storage.enabled) {
      return err(storageDisabled);
    }

    const form = await this.forms.findById(formId);

    if (!form) {
      return err(notFound);
    }

    if (form.isSendingEmails(this.clock.now())) {
      return err(ruleError('emails_sending'));
    }

    if (form.isClosed) {
      return err(ruleError('form_closed'));
    }

    const uploadId = this.ids.next();

    const uploadUrl = await this.storage.presignUpload(
      headerImageKeys.upload(formId, uploadId),
      contentType,
      UPLOAD_URL_TTL_SECONDS,
    );

    return ok({
      uploadId,
      uploadUrl,
      contentType,
      expiresAt: new Date(Date.now() + UPLOAD_URL_TTL_SECONDS * 1000).toISOString(),
    });
  }
}

// Confirma o envio: valida o conteúdo real, grava WebP sem metadados (reduzido para caber em
// 1600 x 1200 px) e apaga o envio bruto e a imagem anterior. Processada na própria requisição.
export class CompleteHeaderImageUploadUseCase {
  constructor(
    private readonly forms: FormRepository,
    private readonly storage: FormImageStorage,
    private readonly processor: HeaderImageProcessor,
    private readonly views: FormViews,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
  ) {}

  async execute(formId: string, uploadId: string): Promise<FormResult> {
    if (!this.storage.enabled) {
      return err(storageDisabled);
    }

    const form = await this.forms.findById(formId);

    if (!form) {
      return err(notFound);
    }

    if (form.isSendingEmails(this.clock.now())) {
      return err(ruleError('emails_sending'));
    }

    if (form.isClosed) {
      return err(ruleError('form_closed'));
    }

    const uploadKey = headerImageKeys.upload(formId, uploadId);

    const size = await this.storage.size(uploadKey);

    if (size === null) {
      return err(uploadMissing);
    }

    // A URL pré-assinada não limita o tamanho: o excesso é descartado aqui.
    if (size > MAX_HEADER_IMAGE_BYTES) {
      await this.storage.delete([uploadKey]);

      return err(uploadTooLarge);
    }

    const upload = await this.storage.read(uploadKey);

    const image = upload ? await this.processor.process(upload) : null;

    if (!image) {
      await this.storage.delete([uploadKey]);

      return upload ? err(invalidImage) : err(uploadMissing);
    }

    const key = this.ids.next();

    const imageKey = headerImageKeys.image(formId, key);

    await this.storage.write(imageKey, image.body, 'image/webp');

    const replaced = form.replaceHeaderImage({
      key,
      width: image.width,
      height: image.height,
      contentType: 'image/webp',
      byteSize: image.body.byteLength,
    });

    const saved = replaced.ok ? await this.forms.update(form) : null;

    if (!replaced.ok || !saved) {
      await this.storage.delete([imageKey, uploadKey]);

      return replaced.ok ? err(versionConflict) : err(ruleError(replaced.error));
    }

    const previous = replaced.value;

    await this.storage.delete([
      uploadKey,
      ...(previous ? [headerImageKeys.image(formId, previous.key)] : []),
    ]);

    return ok(await this.views.of(saved));
  }
}

export class RemoveHeaderImageUseCase {
  constructor(
    private readonly forms: FormRepository,
    private readonly storage: FormImageStorage,
    private readonly views: FormViews,
    private readonly clock: Clock,
  ) {}

  async execute(formId: string): Promise<FormResult> {
    const form = await this.forms.findById(formId);

    if (!form) {
      return err(notFound);
    }

    if (form.isSendingEmails(this.clock.now())) {
      return err(ruleError('emails_sending'));
    }

    const removed = form.removeHeaderImage();

    if (!removed.ok) {
      return err(ruleError(removed.error));
    }

    if (!removed.value) {
      return ok(await this.views.of(form.toSnapshot()));
    }

    const saved = await this.forms.update(form);

    if (!saved) {
      return err(versionConflict);
    }

    if (this.storage.enabled) {
      await this.storage.delete([headerImageKeys.image(formId, removed.value.key)]);
    }

    return ok(await this.views.of(saved));
  }
}
