import { err, ok, type Result } from '../../../shared/domain/result.js';

const BACKLOG_CARD_TITLE_MAX_LENGTH = 120;

const BACKLOG_CARD_DESCRIPTION_MAX_LENGTH = 5000;

// A ordem da lista é a ordem das colunas do quadro.
export const BACKLOG_CARD_STATUSES = [
  'CREATED',
  'PRIORITIZED',
  'REFINED',
  'IN_PROGRESS',
  'TESTING',
  'HOMOLOGATED',
  'DONE',
  'DEPLOYED',
] as const;

export type BacklogCardStatus = (typeof BACKLOG_CARD_STATUSES)[number];

export const BACKLOG_CARD_TYPES = ['FEATURE', 'BUG', 'ADJUSTMENT'] as const;

export type BacklogCardType = (typeof BACKLOG_CARD_TYPES)[number];

export interface BacklogCardDetails {
  title: string;
  description: string;
  type: BacklogCardType;
}

export interface BacklogCardSnapshot extends BacklogCardDetails {
  id: string;
  status: BacklogCardStatus;
  version: number;
  createdAt: string;
  updatedAt: string;
  statusChangedAt: string;
}

// Normaliza e valida os dados do card; devolve os campos recusados no formato do contrato.
export const buildBacklogCardDetails = (input: {
  title: string;
  description: string;
  type: BacklogCardType;
}): Result<BacklogCardDetails, string[]> => {
  const title = input.title.trim();

  const description = input.description.trim();

  const fields: string[] = [];

  if (title === '' || title.length > BACKLOG_CARD_TITLE_MAX_LENGTH) {
    fields.push('title');
  }

  if (description === '' || description.length > BACKLOG_CARD_DESCRIPTION_MAX_LENGTH) {
    fields.push('description');
  }

  return fields.length > 0 ? err(fields) : ok({ title, description, type: input.type });
};

// Card do backlog (ADR 0014): solicitação de funcionalidade, erro ou ajuste que percorre as etapas
// do quadro. As datas são mantidas aqui, nunca informadas por quem chama.
export class BacklogCard {
  private constructor(private state: BacklogCardSnapshot) {}

  static create(
    id: string,
    details: BacklogCardDetails,
    status: BacklogCardStatus,
    now: string,
  ): BacklogCard {
    return new BacklogCard({
      id,
      ...details,
      status,
      version: 1,
      createdAt: now,
      updatedAt: now,
      statusChangedAt: now,
    });
  }

  static restore(snapshot: BacklogCardSnapshot): BacklogCard {
    return new BacklogCard({ ...snapshot });
  }

  get version(): number {
    return this.state.version;
  }

  // Salvar sem mudar nada não conta como alteração do card.
  update(details: BacklogCardDetails, now: string): void {
    const { description, title, type } = this.state;

    const changed =
      details.title !== title || details.description !== description || details.type !== type;

    this.state = { ...this.state, ...details, updatedAt: changed ? now : this.state.updatedAt };
  }

  // Para qualquer outra etapa, avançando ou voltando.
  moveTo(status: BacklogCardStatus, now: string): Result<void, 'same_status'> {
    if (status === this.state.status) {
      return err('same_status');
    }

    this.state = { ...this.state, status, updatedAt: now, statusChangedAt: now };

    return ok();
  }

  toSnapshot(): BacklogCardSnapshot {
    return { ...this.state };
  }
}
