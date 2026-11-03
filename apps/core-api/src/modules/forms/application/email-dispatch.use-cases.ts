import { err, ok, type Result } from '../../../shared/domain/result.js';
import { FormInvitation, recipientKeyOf } from '../domain/form-invitation.js';
import {
  formRecipients,
  pendingRecipients,
  recipientCount,
  type FormView,
  type FormViews,
} from './form-views.js';
import { notFound, ruleError, versionConflict, type FormsError } from './forms-errors.js';
import type { EmailDispatchKind } from '../domain/form.js';
import type {
  Clock,
  FormInvitationRepository,
  FormRepository,
  IdGenerator,
  InvitationTokens,
  RecipientGroupCatalog,
} from './ports.js';

// Envio dos e-mails do formulário aos grupos (ADR 0013). A Core API não conhece os endereços: o BFF
// inicia o envio, informa nome e e-mail das contas (e devolve os e-mails avulsos), recebe os tokens
// dos links, envia e conclui.

export interface StartedDispatch {
  dispatchId: string;
  recipientAccountIds: string[];
  // E-mails avulsos pendentes: dos grupos abertos e mistos e os informados no formulário.
  recipientEmails: string[];
  form: FormView;
}

// accountId null: e-mail avulso (pessoa sem conta).
export interface DispatchRecipient {
  accountId: string | null;
  name: string;
  email: string;
}

// Resultado do envio de cada convite, informado pelo BFF ao concluir.
export interface DeliveryResult {
  invitationId: string;
  messageId: string | null;
  sent: boolean;
}

export interface InvitationLink extends DispatchRecipient {
  // Entregue somente nesta resposta; o banco guarda o hash.
  token: string;
  invitationId: string;
}

// Marca o envio em andamento: até a conclusão, o formulário fica bloqueado.
export class StartEmailDispatchUseCase {
  constructor(
    private readonly forms: FormRepository,
    private readonly groups: RecipientGroupCatalog,
    private readonly views: FormViews,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
    private readonly invitations: FormInvitationRepository,
  ) {}

  async execute(
    formId: string,
    kind: EmailDispatchKind,
  ): Promise<Result<StartedDispatch, FormsError>> {
    const form = await this.forms.findById(formId);

    if (!form) {
      return err(notFound);
    }

    // Lembrete precisa de alguém pendente.
    if (kind === 'REMINDER') {
      const stats = (await this.invitations.statsByForms([formId])).get(formId);

      if (!stats || stats.invitedCount === stats.answeredCount) {
        return err({ type: 'no_pending_invitations' });
      }
    }

    // Quem já respondeu (pelo link ou em papel) não recebe de novo; sem ninguém pendente nos grupos,
    // não há envio.
    const members = await formRecipients(this.groups, form.toSnapshot());

    const answered = (await this.invitations.answeredRecipientKeys([formId])).get(formId);

    const pending = pendingRecipients(members, answered);

    if (recipientCount(members) > 0 && recipientCount(pending) === 0) {
      return err({ type: 'no_pending_recipients' });
    }

    const dispatchId = this.ids.next();

    const started = form.startEmailDispatch(dispatchId, kind, this.clock.now(), this.clock.today());

    if (!started.ok) {
      return err(ruleError(started.error));
    }

    const saved = await this.forms.update(form);

    if (!saved) {
      return err(versionConflict);
    }

    return ok({
      dispatchId,
      recipientAccountIds: pending.accountIds,
      recipientEmails: pending.emails,
      form: await this.views.of(saved),
    });
  }
}

// Cria os convites dos destinatários ainda sem convite e troca o token dos pendentes. Quem já
// respondeu não recebe de novo.
export class PrepareInvitationsUseCase {
  constructor(
    private readonly forms: FormRepository,
    private readonly invitations: FormInvitationRepository,
    private readonly tokens: InvitationTokens,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
  ) {}

  async execute(
    formId: string,
    dispatchId: string,
    recipients: readonly DispatchRecipient[],
  ): Promise<Result<InvitationLink[], FormsError>> {
    const form = await this.forms.findById(formId);

    if (!form) {
      return err(notFound);
    }

    if (!form.isDispatching(dispatchId, this.clock.now())) {
      return err(ruleError('dispatch_not_found'));
    }

    const existing = new Map(
      (await this.invitations.findByForm(formId)).map((invitation) => [
        invitation.recipientKey,
        invitation,
      ]),
    );

    const now = this.clock.now().toISOString();

    // Lembrete: só quem já tem convite pendente (quem entrou nos grupos depois recebe pelo reenvio).
    const isReminder = form.emailDispatchKind === 'REMINDER';

    const prepared = recipients.flatMap((recipient) => {
      const current = existing.get(
        recipientKeyOf({ accountId: recipient.accountId, recipientEmail: recipient.email }),
      );

      if (current?.isAnswered || (isReminder && !current)) {
        return [];
      }

      const { hash, token } = this.tokens.generate();

      if (current) {
        current.resend(recipient, hash, now);

        return [{ invitation: current, link: { ...recipient, token, invitationId: current.id } }];
      }

      const invitation = FormInvitation.create(this.ids.next(), formId, recipient, hash, now);

      return [{ invitation, link: { ...recipient, token, invitationId: invitation.id } }];
    });

    await this.invitations.saveAll(prepared.map(({ invitation }) => invitation));

    return ok(prepared.map(({ link }) => link));
  }
}

// Conclusão informada pelo BFF: desbloqueia o formulário e guarda o resultado.
export class FinishEmailDispatchUseCase {
  constructor(
    private readonly forms: FormRepository,
    private readonly views: FormViews,
    private readonly clock: Clock,
    private readonly invitations: FormInvitationRepository,
  ) {}

  async execute(
    formId: string,
    dispatchId: string,
    result: { sentCount: number; failedCount: number; deliveries: DeliveryResult[] },
  ): Promise<Result<FormView, FormsError>> {
    const form = await this.forms.findById(formId);

    if (!form) {
      return err(notFound);
    }

    const finished = form.finishEmailDispatch(dispatchId, result, this.clock.now());

    if (!finished.ok) {
      return err(ruleError(finished.error));
    }

    await this.recordDeliveries(formId, result.deliveries);

    const saved = await this.forms.update(form);

    return saved ? ok(await this.views.of(saved)) : err(versionConflict);
  }

  // Situação de entrega de cada convite enviado (os eventos do webhook continuam a partir daqui).
  private async recordDeliveries(formId: string, deliveries: readonly DeliveryResult[]) {
    if (deliveries.length === 0) {
      return;
    }

    const byInvitation = new Map(deliveries.map((delivery) => [delivery.invitationId, delivery]));

    const now = this.clock.now().toISOString();

    const touched = (await this.invitations.findByForm(formId)).filter((invitation) => {
      const delivery = byInvitation.get(invitation.id);

      if (delivery) {
        invitation.recordSend(delivery.messageId, delivery.sent, now);
      }

      return delivery !== undefined;
    });

    await this.invitations.saveAll(touched);
  }
}
