import { effectiveEmailDispatch, type FormSnapshot } from '../domain/form.js';
import { headerImageKeys } from './header-image-keys.js';
import type {
  Clock,
  FormImageStorage,
  FormInvitationRepository,
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
  // Contas dos grupos que ainda não responderam: quem o reenvio alcançaria.
  pendingRecipientCount: number;
}

// Contas dos grupos que ainda não responderam (pelo link ou em papel).
export const pendingRecipients = (
  memberAccountIds: readonly string[],
  answered: ReadonlySet<string> | undefined,
) => memberAccountIds.filter((accountId) => !answered?.has(accountId));

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
      this.invitations.answeredAccountIds(ids),
    ]);

    const now = this.clock.now();

    return Promise.all(
      snapshots.map(async ({ emailDispatch, headerImage, ...snapshot }) => {
        const dispatch = effectiveEmailDispatch(emailDispatch, now);

        const members = await this.groups.memberAccountIds(snapshot.recipientGroupIds);

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
          pendingRecipientCount: pendingRecipients(members, answered.get(snapshot.id)).length,
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
