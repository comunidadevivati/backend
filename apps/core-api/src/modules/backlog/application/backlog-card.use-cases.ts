import { err, ok, type Result } from '../../../shared/domain/result.js';
import {
  BacklogCard,
  buildBacklogCardDetails,
  type BacklogCardDetails,
  type BacklogCardSnapshot,
  type BacklogCardStatus,
} from '../domain/backlog-card.js';
import type { BacklogCardRepository, IdGenerator } from './ports.js';

export type BacklogError =
  | { type: 'not_found' }
  | { type: 'invalid_fields'; fields: string[] }
  | { type: 'version_conflict' }
  | { type: 'same_status' };

const notFound = { type: 'not_found' } as const;

const versionConflict = { type: 'version_conflict' } as const;

const sameStatus = { type: 'same_status' } as const;

const invalidFields = (fields: string[]) => ({ type: 'invalid_fields', fields }) as const;

export interface CreateBacklogCardCommand extends BacklogCardDetails {
  status: BacklogCardStatus;
}

export interface UpdateBacklogCardCommand extends BacklogCardDetails {
  id: string;
  version: number;
}

export interface MoveBacklogCardCommand {
  id: string;
  version: number;
  status: BacklogCardStatus;
}

type CardResult = Result<BacklogCardSnapshot, BacklogError>;

export class ListBacklogCardsUseCase {
  constructor(private readonly cards: BacklogCardRepository) {}

  async execute(): Promise<{ items: BacklogCardSnapshot[] }> {
    return { items: await this.cards.list() };
  }
}

// O card nasce na etapa informada: a primeira do quadro ou a coluna em que foi adicionado.
export class CreateBacklogCardUseCase {
  constructor(
    private readonly cards: BacklogCardRepository,
    private readonly ids: IdGenerator,
  ) {}

  async execute({ status, ...input }: CreateBacklogCardCommand): Promise<CardResult> {
    const details = buildBacklogCardDetails(input);

    if (!details.ok) {
      return err(invalidFields(details.error));
    }

    const card = BacklogCard.create(
      this.ids.next(),
      details.value,
      status,
      new Date().toISOString(),
    );

    await this.cards.insert(card);

    return ok(card.toSnapshot());
  }
}

// Título, descrição e tipo, com controle otimista; a etapa só muda pelo MoveBacklogCardUseCase.
export class UpdateBacklogCardUseCase {
  constructor(private readonly cards: BacklogCardRepository) {}

  async execute({ id, version, ...input }: UpdateBacklogCardCommand): Promise<CardResult> {
    const card = await this.cards.findById(id);

    if (!card) {
      return err(notFound);
    }

    if (card.version !== version) {
      return err(versionConflict);
    }

    const details = buildBacklogCardDetails(input);

    if (!details.ok) {
      return err(invalidFields(details.error));
    }

    card.update(details.value, new Date().toISOString());

    const saved = await this.cards.update(card);

    return saved ? ok(saved) : err(versionConflict);
  }
}

export class MoveBacklogCardUseCase {
  constructor(private readonly cards: BacklogCardRepository) {}

  async execute({ id, status, version }: MoveBacklogCardCommand): Promise<CardResult> {
    const card = await this.cards.findById(id);

    if (!card) {
      return err(notFound);
    }

    if (card.version !== version) {
      return err(versionConflict);
    }

    if (!card.moveTo(status, new Date().toISOString()).ok) {
      return err(sameStatus);
    }

    const saved = await this.cards.update(card);

    return saved ? ok(saved) : err(versionConflict);
  }
}

export class DeleteBacklogCardUseCase {
  constructor(private readonly cards: BacklogCardRepository) {}

  async execute(id: string): Promise<Result<void, BacklogError>> {
    return (await this.cards.delete(id)) ? ok() : err(notFound);
  }
}
