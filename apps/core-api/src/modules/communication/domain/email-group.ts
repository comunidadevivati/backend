import { err, ok, type Result } from '../../../shared/domain/result.js';

export const EMAIL_GROUP_NAME_MAX_LENGTH = 80;

export const EMAIL_GROUP_DESCRIPTION_MAX_LENGTH = 300;

export const MAX_EMAIL_GROUP_MEMBERS = 5000;

export interface EmailGroupDetails {
  name: string;
  description: string | null;
  // Contas (BFF, auth.users) que recebem os e-mails do grupo, sem repetição.
  memberAccountIds: string[];
}

export interface EmailGroupSnapshot extends EmailGroupDetails {
  id: string;
  version: number;
  createdAt: string;
  updatedAt: string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

// Normaliza e valida os dados do grupo; devolve os campos recusados no formato do contrato.
export const buildEmailGroupDetails = (input: {
  name: string;
  description: string | null;
  memberAccountIds: readonly string[];
}): Result<EmailGroupDetails, string[]> => {
  const name = input.name.trim();

  const description = input.description?.trim() || null;

  const memberAccountIds = [...new Set(input.memberAccountIds.map((id) => id.toLowerCase()))];

  const fields: string[] = [];

  if (name === '' || name.length > EMAIL_GROUP_NAME_MAX_LENGTH) {
    fields.push('name');
  }

  if (description !== null && description.length > EMAIL_GROUP_DESCRIPTION_MAX_LENGTH) {
    fields.push('description');
  }

  if (
    memberAccountIds.length > MAX_EMAIL_GROUP_MEMBERS ||
    memberAccountIds.some((id) => !UUID.test(id))
  ) {
    fields.push('memberAccountIds');
  }

  return fields.length > 0 ? err(fields) : ok({ name, description, memberAccountIds });
};

// Grupo de e-mails (ADR 0013): lista nomeada de contas verificadas que recebem comunicações, como os
// formulários dos departamentos. O nome é único (sem diferenciar maiúsculas).
export class EmailGroup {
  private constructor(private state: EmailGroupSnapshot) {}

  static create(id: string, details: EmailGroupDetails, now: string): EmailGroup {
    return new EmailGroup({ id, ...details, version: 1, createdAt: now, updatedAt: now });
  }

  static restore(snapshot: EmailGroupSnapshot): EmailGroup {
    return new EmailGroup({ ...snapshot, memberAccountIds: [...snapshot.memberAccountIds] });
  }

  get id(): string {
    return this.state.id;
  }

  get version(): number {
    return this.state.version;
  }

  update(details: EmailGroupDetails): void {
    this.state = { ...this.state, ...details };
  }

  toSnapshot(): EmailGroupSnapshot {
    return { ...this.state, memberAccountIds: [...this.state.memberAccountIds] };
  }
}
