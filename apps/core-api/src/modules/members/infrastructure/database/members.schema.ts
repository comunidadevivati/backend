import { sql } from 'drizzle-orm';
import {
  boolean,
  date,
  index,
  integer,
  pgSchema,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

// Schema de propriedade exclusiva do contexto Members.
export const membersSchema = pgSchema('members');

export const memberStatus = membersSchema.enum('member_status', ['ACTIVE', 'INACTIVE', 'ARCHIVED']);

export const membershipStatus = membersSchema.enum('membership_status', [
  'PENDING',
  'ACTIVE',
  'INACTIVE',
]);

const auditColumns = {
  // Controle otimista de concorrência: incrementada a cada gravação.
  version: integer('version').notNull().default(1),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
};

// Nome, telefone (somente dígitos) e e-mail (minúsculas) são normalizados pelo Domain.
export const members = membersSchema.table(
  'members',
  {
    id: uuid('id').primaryKey(),
    fullName: text('full_name').notNull(),
    birthDate: date('birth_date', { mode: 'string' }),
    phone: text('phone'),
    email: text('email'),
    status: memberStatus('status').notNull().default('ACTIVE'),
    ...auditColumns,
  },
  (table) => [index('members_status_idx').on(table.status)],
);

// congregation_id referencia o contexto Organization somente pelo ID estável, sem chave
// estrangeira entre schemas: cada contexto é dono dos próprios dados.
export const memberships = membersSchema.table(
  'memberships',
  {
    id: uuid('id').primaryKey(),
    memberId: uuid('member_id')
      .notNull()
      .references(() => members.id),
    congregationId: uuid('congregation_id').notNull(),
    primary: boolean('is_primary').notNull().default(false),
    status: membershipStatus('status').notNull().default('PENDING'),
    startedOn: date('started_on', { mode: 'string' }),
    endedOn: date('ended_on', { mode: 'string' }),
    ...auditColumns,
  },
  (table) => [
    index('memberships_member_id_idx').on(table.memberId),
    index('memberships_congregation_id_idx').on(table.congregationId),
    // Um único vínculo aberto (pendente ou ativo) por membro e congregação.
    uniqueIndex('memberships_open_uidx')
      .on(table.memberId, table.congregationId)
      .where(sql`${table.status} in ('PENDING', 'ACTIVE')`),
    // No máximo um vínculo congregacional principal ativo por membro.
    uniqueIndex('memberships_active_primary_uidx')
      .on(table.memberId)
      .where(sql`${table.primary} and ${table.status} = 'ACTIVE'`),
  ],
);
