import { sql } from 'drizzle-orm';
import { integer, pgSchema, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

// Schema de propriedade exclusiva do contexto Communication (ADR 0013).
export const communicationSchema = pgSchema('communication');

export const emailGroups = communicationSchema.table(
  'email_groups',
  {
    id: uuid('id').primaryKey(),
    name: text('name').notNull(),
    description: text('description'),
    // Contas do BFF (auth.users): referência estável por ID, sem cópia do e-mail.
    memberAccountIds: uuid('member_account_ids').array().notNull().default([]),
    // Controle otimista de concorrência: incrementada a cada gravação.
    version: integer('version').notNull().default(1),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex('email_groups_name_key').on(sql`lower(${table.name})`)],
);
