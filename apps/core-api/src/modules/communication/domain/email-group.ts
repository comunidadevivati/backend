import { err, ok, type Result } from '../../../shared/domain/result.js';

const EMAIL_GROUP_NAME_MAX_LENGTH = 80;

const EMAIL_GROUP_DESCRIPTION_MAX_LENGTH = 300;

// Limite de destinatários do grupo: contas e e-mails avulsos somados.
const MAX_EMAIL_GROUP_MEMBERS = 5000;

const EMAIL_MAX_LENGTH = 320;

// Restrito: só contas verificadas. Aberto: só e-mails avulsos (informados à mão). Misto: os dois.
export const EMAIL_GROUP_TYPES = ['RESTRICTED', 'OPEN', 'MIXED'] as const;

export type EmailGroupType = (typeof EMAIL_GROUP_TYPES)[number];

export interface EmailGroupDetails {
  name: string;
  description: string | null;
  type: EmailGroupType;
  // Contas (BFF, auth.users) que recebem os e-mails do grupo, sem repetição.
  memberAccountIds: string[];
  // E-mails avulsos (pessoas sem conta), em minúsculas e sem repetição.
  externalEmails: string[];
}

export interface EmailGroupSnapshot extends EmailGroupDetails {
  id: string;
  version: number;
  createdAt: string;
  updatedAt: string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

// Formato prático de e-mail (local@domínio.tld, sem espaços); a entrega confirma o restante.
const EMAIL = /^[^\s@]+@[^\s@.]+(?:\.[^\s@.]+)+$/u;

const unique = (values: readonly string[]) => [
  ...new Set(values.map((value) => value.trim().toLowerCase())),
];

// Normaliza e valida os dados do grupo; devolve os campos recusados no formato do contrato.
export const buildEmailGroupDetails = (input: {
  name: string;
  description: string | null;
  type: EmailGroupType;
  memberAccountIds: readonly string[];
  externalEmails: readonly string[];
}): Result<EmailGroupDetails, string[]> => {
  const name = input.name.trim();

  const description = input.description?.trim() || null;

  const { type } = input;

  const memberAccountIds = unique(input.memberAccountIds);

  const externalEmails = unique(input.externalEmails);

  const fields: string[] = [];

  if (name === '' || name.length > EMAIL_GROUP_NAME_MAX_LENGTH) {
    fields.push('name');
  }

  if (description !== null && description.length > EMAIL_GROUP_DESCRIPTION_MAX_LENGTH) {
    fields.push('description');
  }

  const tooMany = memberAccountIds.length + externalEmails.length > MAX_EMAIL_GROUP_MEMBERS;

  if (
    tooMany ||
    (type === 'OPEN' && memberAccountIds.length > 0) ||
    memberAccountIds.some((id) => !UUID.test(id))
  ) {
    fields.push('memberAccountIds');
  }

  if (
    tooMany ||
    (type === 'RESTRICTED' && externalEmails.length > 0) ||
    externalEmails.some((email) => email.length > EMAIL_MAX_LENGTH || !EMAIL.test(email))
  ) {
    fields.push('externalEmails');
  }

  return fields.length > 0
    ? err(fields)
    : ok({ name, description, type, memberAccountIds, externalEmails });
};

// Grupo de e-mails (ADR 0013): lista nomeada de destinatários de comunicações, como os formulários
// dos departamentos. O tipo define quem pode entrar: contas verificadas, e-mails avulsos ou ambos. O
// nome é único (sem diferenciar maiúsculas).
export class EmailGroup {
  private constructor(private state: EmailGroupSnapshot) {}

  static create(id: string, details: EmailGroupDetails, now: string): EmailGroup {
    return new EmailGroup({ id, ...details, version: 1, createdAt: now, updatedAt: now });
  }

  static restore(snapshot: EmailGroupSnapshot): EmailGroup {
    return new EmailGroup({
      ...snapshot,
      memberAccountIds: [...snapshot.memberAccountIds],
      externalEmails: [...snapshot.externalEmails],
    });
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
    return {
      ...this.state,
      memberAccountIds: [...this.state.memberAccountIds],
      externalEmails: [...this.state.externalEmails],
    };
  }
}
