import { err, ok, type Result } from '../../../shared/domain/result.js';
import {
  notFound,
  storageDisabled,
  uploadMissing,
  uploadTooLarge,
  versionConflict,
  type FormsError,
} from './forms-errors.js';
import type {
  AnswerChannel,
  DeliveryStatus,
  FormAnswer,
  FormInvitation,
  FormInvitationSnapshot,
  InvitationStatus,
} from '../domain/form-invitation.js';
import type {
  Clock,
  FormImageStorage,
  FormInvitationRepository,
  FormRepository,
  IdGenerator,
} from './ports.js';

// Respostas no painel (ADR 0013): lista dos convites com as respostas digitais e o registro manual
// de respostas em papel, com o formulário preenchido digitalizado como anexo opcional.

// PDF, JPEG ou PNG de até 2 MB; o tipo real é conferido pelo conteúdo.
export const PAPER_ATTACHMENT_CONTENT_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
] as const;

type PaperAttachmentContentType = (typeof PAPER_ATTACHMENT_CONTENT_TYPES)[number];

const MAX_PAPER_ATTACHMENT_BYTES = 2 * 1024 * 1024;

const UPLOAD_URL_TTL_SECONDS = 10 * 60;

const DOWNLOAD_URL_TTL_SECONDS = 5 * 60;

const EXTENSIONS: Record<PaperAttachmentContentType, string> = {
  'application/pdf': 'pdf',
  'image/jpeg': 'jpg',
  'image/png': 'png',
};

// Assinatura dos primeiros bytes de cada formato aceito.
const detectContentType = (body: Uint8Array): PaperAttachmentContentType | null => {
  const starts = (...bytes: number[]) => bytes.every((byte, index) => body[index] === byte);

  if (starts(0x25, 0x50, 0x44, 0x46)) {
    return 'application/pdf';
  }

  if (starts(0xff, 0xd8, 0xff)) {
    return 'image/jpeg';
  }

  return starts(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a) ? 'image/png' : null;
};

const paperKeys = {
  upload: (invitationId: string, uploadId: string) =>
    `forms/uploads/paper-answers/${invitationId}/${uploadId}`,
  file: (formId: string, invitationId: string, key: string) =>
    `forms/private/forms/${formId}/paper-answers/${invitationId}/${key}`,
};

// Chaves dos anexos de um formulário (para apagar junto com ele).
export const paperAttachmentKeys = (invitations: readonly FormInvitation[]): string[] =>
  invitations.flatMap((invitation) => {
    const { formId, id, paperAttachment } = invitation.toSnapshot();

    return paperAttachment ? [paperKeys.file(formId, id, paperAttachment.key)] : [];
  });

// Nome seguro para o arquivo baixado: sem caminhos nem caracteres de controle, até 120 caracteres.
const safeFileName = (fileName: string, contentType: PaperAttachmentContentType): string => {
  const base =
    fileName
      .split(/[\\/]/u)
      .at(-1)
      ?.replaceAll(/[\p{Cc}"]/gu, '')
      .trim()
      .slice(0, 120) ?? '';

  return base === '' ? `formulario-preenchido.${EXTENSIONS[contentType]}` : base;
};

export interface InvitationAdminView {
  id: string;
  recipientName: string;
  recipientEmail: string;
  status: InvitationStatus;
  answerChannel: AnswerChannel | null;
  sentAt: string;
  answeredAt: string | null;
  answers: FormAnswer[];
  paperAttachment: { fileName: string; contentType: string; byteSize: number } | null;
  // Entrega do último e-mail do convite (webhook do Resend).
  deliveryStatus: DeliveryStatus | null;
  deliveryUpdatedAt: string | null;
}

export interface PaperAttachmentUploadTicket {
  uploadId: string;
  uploadUrl: string;
  contentType: PaperAttachmentContentType;
  expiresAt: string;
}

const toAdminView = (snapshot: FormInvitationSnapshot): InvitationAdminView => ({
  id: snapshot.id,
  recipientName: snapshot.recipientName,
  recipientEmail: snapshot.recipientEmail,
  status: snapshot.status,
  answerChannel: snapshot.answerChannel,
  sentAt: snapshot.sentAt,
  answeredAt: snapshot.answeredAt,
  answers: snapshot.answers,
  paperAttachment: snapshot.paperAttachment && {
    fileName: snapshot.paperAttachment.fileName,
    contentType: snapshot.paperAttachment.contentType,
    byteSize: snapshot.paperAttachment.byteSize,
  },
  deliveryStatus: snapshot.deliveryStatus,
  deliveryUpdatedAt: snapshot.deliveryUpdatedAt,
});

type InvitationResult = Result<InvitationAdminView, FormsError>;

// Convite do próprio formulário (o ID do formulário na rota precisa bater).
const loadInvitation = async (
  invitations: FormInvitationRepository,
  formId: string,
  invitationId: string,
): Promise<FormInvitation | null> => {
  const invitation = await invitations.findById(invitationId);

  return invitation?.toSnapshot().formId === formId ? invitation : null;
};

export class ListInvitationsUseCase {
  constructor(
    private readonly forms: FormRepository,
    private readonly invitations: FormInvitationRepository,
  ) {}

  async execute(formId: string): Promise<Result<{ items: InvitationAdminView[] }, FormsError>> {
    if (!(await this.forms.findById(formId))) {
      return err(notFound);
    }

    const items = (await this.invitations.findByForm(formId))
      .map((invitation) => toAdminView(invitation.toSnapshot()))
      .toSorted((a, b) => a.recipientName.localeCompare(b.recipientName, 'pt-BR'));

    return ok({ items });
  }
}

// Marca como respondido em papel, sem anexo (o anexo pode vir depois).
export class MarkPaperAnswerUseCase {
  constructor(
    private readonly invitations: FormInvitationRepository,
    private readonly clock: Clock,
  ) {}

  async execute(formId: string, invitationId: string): Promise<InvitationResult> {
    const invitation = await loadInvitation(this.invitations, formId, invitationId);

    if (!invitation) {
      return err(notFound);
    }

    const marked = invitation.markPaperAnswer(this.clock.now().toISOString(), null);

    if (!marked.ok) {
      return err({ type: marked.error });
    }

    if (!(await this.invitations.update(invitation))) {
      return err(versionConflict);
    }

    return ok(toAdminView(invitation.toSnapshot()));
  }
}

// Desfaz a marcação em papel e apaga o anexo.
export class UnmarkPaperAnswerUseCase {
  constructor(
    private readonly invitations: FormInvitationRepository,
    private readonly storage: FormImageStorage,
  ) {}

  async execute(formId: string, invitationId: string): Promise<InvitationResult> {
    const invitation = await loadInvitation(this.invitations, formId, invitationId);

    if (!invitation) {
      return err(notFound);
    }

    const unmarked = invitation.unmarkPaperAnswer();

    if (!unmarked.ok) {
      return err({ type: unmarked.error });
    }

    if (!(await this.invitations.update(invitation))) {
      return err(versionConflict);
    }

    if (unmarked.value && this.storage.enabled) {
      await this.storage.delete([paperKeys.file(formId, invitationId, unmarked.value.key)]);
    }

    return ok(toAdminView(invitation.toSnapshot()));
  }
}

export class RequestPaperAttachmentUploadUseCase {
  constructor(
    private readonly invitations: FormInvitationRepository,
    private readonly storage: FormImageStorage,
    private readonly ids: IdGenerator,
  ) {}

  async execute(
    formId: string,
    invitationId: string,
    contentType: PaperAttachmentContentType,
  ): Promise<Result<PaperAttachmentUploadTicket, FormsError>> {
    if (!this.storage.enabled) {
      return err(storageDisabled);
    }

    const invitation = await loadInvitation(this.invitations, formId, invitationId);

    if (!invitation) {
      return err(notFound);
    }

    if (invitation.toSnapshot().answerChannel === 'DIGITAL') {
      return err({ type: 'already_answered' });
    }

    const uploadId = this.ids.next();

    const uploadUrl = await this.storage.presignUpload(
      paperKeys.upload(invitationId, uploadId),
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

// Confirma o envio do anexo: confere tamanho e conteúdo, guarda na área privada e marca a resposta
// em papel (substituindo o anexo anterior).
export class CompletePaperAttachmentUploadUseCase {
  constructor(
    private readonly invitations: FormInvitationRepository,
    private readonly storage: FormImageStorage,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
  ) {}

  async execute(
    formId: string,
    invitationId: string,
    upload: { uploadId: string; fileName: string },
  ): Promise<InvitationResult> {
    if (!this.storage.enabled) {
      return err(storageDisabled);
    }

    const invitation = await loadInvitation(this.invitations, formId, invitationId);

    if (!invitation) {
      return err(notFound);
    }

    const uploadKey = paperKeys.upload(invitationId, upload.uploadId);

    const size = await this.storage.size(uploadKey);

    if (size === null) {
      return err(uploadMissing);
    }

    if (size > MAX_PAPER_ATTACHMENT_BYTES) {
      await this.storage.delete([uploadKey]);

      return err(uploadTooLarge);
    }

    const body = await this.storage.read(uploadKey);

    const contentType = body ? detectContentType(body) : null;

    if (!body || !contentType) {
      await this.storage.delete([uploadKey]);

      return body ? err({ type: 'invalid_attachment' }) : err(uploadMissing);
    }

    const key = `${this.ids.next()}.${EXTENSIONS[contentType]}`;

    const fileKey = paperKeys.file(formId, invitationId, key);

    await this.storage.write(fileKey, body, contentType);

    const marked = invitation.markPaperAnswer(this.clock.now().toISOString(), {
      key,
      fileName: safeFileName(upload.fileName, contentType),
      contentType,
      byteSize: body.byteLength,
    });

    const saved = marked.ok && (await this.invitations.update(invitation));

    if (!marked.ok || !saved) {
      await this.storage.delete([fileKey, uploadKey]);

      return marked.ok ? err(versionConflict) : err({ type: marked.error });
    }

    await this.storage.delete([
      uploadKey,
      ...(marked.value ? [paperKeys.file(formId, invitationId, marked.value.key)] : []),
    ]);

    return ok(toAdminView(invitation.toSnapshot()));
  }
}

// URL de leitura do anexo, de validade curta: abre no visualizador do navegador (com o nome do
// arquivo para baixar).
export class GetPaperAttachmentUrlUseCase {
  constructor(
    private readonly invitations: FormInvitationRepository,
    private readonly storage: FormImageStorage,
  ) {}

  async execute(
    formId: string,
    invitationId: string,
  ): Promise<Result<{ url: string }, FormsError>> {
    if (!this.storage.enabled) {
      return err(storageDisabled);
    }

    const invitation = await loadInvitation(this.invitations, formId, invitationId);

    const attachment = invitation?.paperAttachment;

    if (!attachment) {
      return err(notFound);
    }

    return ok({
      url: await this.storage.presignDownload(
        paperKeys.file(formId, invitationId, attachment.key),
        DOWNLOAD_URL_TTL_SECONDS,
        attachment.fileName,
      ),
    });
  }
}
