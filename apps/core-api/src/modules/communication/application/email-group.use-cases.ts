import { err, ok, type Result } from '../../../shared/domain/result.js';
import {
  EmailGroup,
  buildEmailGroupDetails,
  type EmailGroupSnapshot,
} from '../domain/email-group.js';
import type { EmailGroupRepository, IdGenerator } from './ports.js';

export type CommunicationError =
  | { type: 'not_found' }
  | { type: 'invalid_fields'; fields: string[] }
  | { type: 'version_conflict' }
  | { type: 'name_taken' };

const notFound = { type: 'not_found' } as const;

const versionConflict = { type: 'version_conflict' } as const;

const nameTaken = { type: 'name_taken' } as const;

const invalidFields = (fields: string[]) => ({ type: 'invalid_fields', fields }) as const;

export interface EmailGroupInput {
  name: string;
  description: string | null;
  memberAccountIds: string[];
}

export interface UpdateEmailGroupCommand extends EmailGroupInput {
  id: string;
  version: number;
}

// Resumo da lista: a quantidade de destinatários no lugar das contas.
export interface EmailGroupSummary {
  id: string;
  name: string;
  description: string | null;
  recipientCount: number;
  version: number;
  updatedAt: string;
}

type GroupResult = Result<EmailGroupSnapshot, CommunicationError>;

const toSummary = ({
  description,
  id,
  memberAccountIds,
  name,
  updatedAt,
  version,
}: EmailGroupSnapshot): EmailGroupSummary => ({
  id,
  name,
  description,
  recipientCount: memberAccountIds.length,
  version,
  updatedAt,
});

export class ListEmailGroupsUseCase {
  constructor(private readonly groups: EmailGroupRepository) {}

  async execute(): Promise<{ items: EmailGroupSummary[] }> {
    return { items: (await this.groups.list()).map((group) => toSummary(group)) };
  }
}

export class GetEmailGroupUseCase {
  constructor(private readonly groups: EmailGroupRepository) {}

  async execute(id: string): Promise<GroupResult> {
    const group = await this.groups.findById(id);

    return group ? ok(group.toSnapshot()) : err(notFound);
  }
}

export class CreateEmailGroupUseCase {
  constructor(
    private readonly groups: EmailGroupRepository,
    private readonly ids: IdGenerator,
  ) {}

  async execute(input: EmailGroupInput): Promise<GroupResult> {
    const details = buildEmailGroupDetails(input);

    if (!details.ok) {
      return err(invalidFields(details.error));
    }

    const group = EmailGroup.create(this.ids.next(), details.value, new Date().toISOString());

    if ((await this.groups.insert(group)) === 'name_taken') {
      return err(nameTaken);
    }

    const saved = await this.groups.findById(group.id);

    return saved ? ok(saved.toSnapshot()) : err(notFound);
  }
}

// Substituição completa (nome, descrição e contas) com controle otimista.
export class UpdateEmailGroupUseCase {
  constructor(private readonly groups: EmailGroupRepository) {}

  async execute({ id, version, ...input }: UpdateEmailGroupCommand): Promise<GroupResult> {
    const group = await this.groups.findById(id);

    if (!group) {
      return err(notFound);
    }

    if (group.version !== version) {
      return err(versionConflict);
    }

    const details = buildEmailGroupDetails(input);

    if (!details.ok) {
      return err(invalidFields(details.error));
    }

    group.update(details.value);

    const saved = await this.groups.update(group);

    if (saved === 'name_taken') {
      return err(nameTaken);
    }

    return saved ? ok(saved) : err(versionConflict);
  }
}

// Formulários que citam o grupo continuam com o ID guardado; ao serem salvos de novo, o ID
// inexistente é recusado (ADR 0013).
export class DeleteEmailGroupUseCase {
  constructor(private readonly groups: EmailGroupRepository) {}

  async execute(id: string): Promise<Result<void, CommunicationError>> {
    return (await this.groups.delete(id)) ? ok() : err(notFound);
  }
}
