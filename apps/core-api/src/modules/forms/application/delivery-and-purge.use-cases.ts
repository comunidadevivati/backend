import { err, ok, type Result } from '../../../shared/domain/result.js';
import { notFound, versionConflict, type FormsError } from './forms-errors.js';
import { paperAttachmentKeys } from './paper-answer.use-cases.js';
import type { DeliveryStatus } from '../domain/form-invitation.js';
import type { FormView, FormViews } from './form-views.js';
import type { Clock, FormImageStorage, FormInvitationRepository, FormRepository } from './ports.js';

// Evento de entrega vindo do webhook do Resend (repassado pelo BFF, que confere a assinatura).
// Mensagem desconhecida (ex.: e-mail de conta) é ignorada.
export class RecordDeliveryEventUseCase {
  constructor(private readonly invitations: FormInvitationRepository) {}

  async execute(messageId: string, status: DeliveryStatus, occurredAt: string): Promise<void> {
    const invitation = await this.invitations.findByMessageId(messageId);

    if (invitation?.recordDeliveryEvent(status, occurredAt)) {
      await this.invitations.update(invitation);
    }
  }
}

// Apaga o conteúdo das respostas (LGPD) de um formulário finalizado ou cancelado: respostas
// digitais, respostas anônimas e anexos das respostas em papel. A participação (quem respondeu e por
// qual canal) continua registrada.
export class PurgeAnswersUseCase {
  constructor(
    private readonly forms: FormRepository,
    private readonly invitations: FormInvitationRepository,
    private readonly storage: FormImageStorage,
    private readonly views: FormViews,
    private readonly clock: Clock,
  ) {}

  async execute(formId: string): Promise<Result<FormView, FormsError>> {
    const form = await this.forms.findById(formId);

    if (!form) {
      return err(notFound);
    }

    const purged = form.purgeAnswers(this.clock.now());

    if (!purged.ok) {
      return err({ type: purged.error });
    }

    const invitations = await this.invitations.findByForm(formId);

    const attachments = paperAttachmentKeys(invitations);

    invitations.forEach((invitation) => invitation.purgeAnswer());

    await this.invitations.saveAll(invitations);

    await this.invitations.deleteAnonymousAnswers(formId);

    if (attachments.length > 0 && this.storage.enabled) {
      await this.storage.delete(attachments);
    }

    const saved = await this.forms.update(form);

    return saved ? ok(await this.views.of(saved)) : err(versionConflict);
  }
}
