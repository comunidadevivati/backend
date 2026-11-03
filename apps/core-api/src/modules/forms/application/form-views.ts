import { effectiveEmailDispatch, type FormSnapshot } from '../domain/form.js';
import { headerImageKeys } from './header-image-keys.js';
import type {
  Clock,
  FormImageStorage,
  FormInvitationRepository,
  GroupRecipients,
  RecipientGroupCatalog,
} from './ports.js';

// Validade da URL de leitura da imagem do cabeçalho devolvida com o formulário.
const IMAGE_URL_TTL_SECONDS = 60 * 60;

export interface FormHeaderImageView {
  url: string;
  width: number;
  height: number;
  contentType: string;
  byteSize: number;
}

// Formulário como exposto: a chave interna da imagem vira uma URL de leitura de validade curta, o
// envio abandonado aparece como FAILED e entram as contagens de convites e respostas.
export interface FormView extends Omit<FormSnapshot, 'headerImage' | 'emailDispatch'> {
  headerImage: FormHeaderImageView | null;
  emailDispatch: {
    kind: 'INVITE' | 'REMINDER';
    status: 'SENDING' | 'SENT' | 'FAILED';
    startedAt: string;
    finishedAt: string | null;
    sentCount: number;
    failedCount: number;
  } | null;
  invitedCount: number;
  answeredCount: number;
  // Destinatários (grupos e e-mails informados) que ainda não responderam: quem o reenvio alcançaria.
  pendingRecipientCount: number;
}

// Destinatários do formulário: contas e e-mails avulsos dos grupos completos mais as contas e os
// e-mails escolhidos um a um no próprio formulário, sem repetição.
export const formRecipients = async (
  groups: RecipientGroupCatalog,
  {
    recipientAccountIds,
    recipientEmails,
    recipientGroupIds,
  }: Pick<FormSnapshot, 'recipientAccountIds' | 'recipientEmails' | 'recipientGroupIds'>,
): Promise<GroupRecipients> => {
  const { accountIds, emails } = await groups.recipients(recipientGroupIds);

  return {
    accountIds: [...new Set([...accountIds, ...recipientAccountIds])],
    emails: [...new Set([...emails, ...recipientEmails])],
  };
};

// Destinatários que ainda não responderam (pelo link ou em papel). As chaves dos convites
// respondidos são o ID da conta ou o e-mail avulso (recipientKeyOf).
export const pendingRecipients = (
  { accountIds, emails }: GroupRecipients,
  answered: ReadonlySet<string> | undefined,
): GroupRecipients => ({
  accountIds: accountIds.filter((accountId) => !answered?.has(accountId)),
  emails: emails.filter((email) => !answered?.has(email)),
});

export const recipientCount = ({ accountIds, emails }: GroupRecipients) =>
  accountIds.length + emails.length;

export class FormViews {
  constructor(
    private readonly storage: FormImageStorage,
    private readonly invitations: FormInvitationRepository,
    private readonly clock: Clock,
    private readonly groups: RecipientGroupCatalog,
  ) {}

  async of(snapshot: FormSnapshot): Promise<FormView> {
    const [view] = await this.ofMany([snapshot]);

    if (!view) {
      throw new Error('Visão do formulário não montada.');
    }

    return view;
  }

  async ofMany(snapshots: readonly FormSnapshot[]): Promise<FormView[]> {
    const ids = snapshots.map(({ id }) => id);

    const [stats, answered] = await Promise.all([
      this.invitations.statsByForms(ids),
      this.invitations.answeredRecipientKeys(ids),
    ]);

    const now = this.clock.now();

    return Promise.all(
      snapshots.map(async ({ emailDispatch, headerImage, ...snapshot }) => {
        const dispatch = effectiveEmailDispatch(emailDispatch, now);

        const members = await formRecipients(this.groups, snapshot);

        return {
          ...snapshot,
          headerImage: await this.imageOf(snapshot.id, headerImage),
          // O ID do envio é interno (usado só entre o BFF e a Core API).
          emailDispatch: dispatch && {
            kind: dispatch.kind,
            status: dispatch.status,
            startedAt: dispatch.startedAt,
            finishedAt: dispatch.finishedAt,
            sentCount: dispatch.sentCount,
            failedCount: dispatch.failedCount,
          },
          invitedCount: stats.get(snapshot.id)?.invitedCount ?? 0,
          answeredCount: stats.get(snapshot.id)?.answeredCount ?? 0,
          pendingRecipientCount: recipientCount(
            pendingRecipients(members, answered.get(snapshot.id)),
          ),
        };
      }),
    );
  }

  private async imageOf(
    formId: string,
    image: FormSnapshot['headerImage'],
  ): Promise<FormHeaderImageView | null> {
    if (!image || !this.storage.enabled) {
      return null;
    }

    const { byteSize, contentType, height, key, width } = image;

    const url = await this.storage.presignDownload(
      headerImageKeys.image(formId, key),
      IMAGE_URL_TTL_SECONDS,
    );

    return { url, width, height, contentType, byteSize };
  }
}
