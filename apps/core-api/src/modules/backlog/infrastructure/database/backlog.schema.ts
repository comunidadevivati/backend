import { integer, pgSchema, text, timestamp, uuid } from 'drizzle-orm/pg-core';

// Schema de propriedade exclusiva do contexto Backlog (ADR 0014).
export const backlogSchema = pgSchema('backlog');

export const backlogCardType = backlogSchema.enum('card_type', ['FEATURE', 'BUG', 'ADJUSTMENT']);

export const backlogCardStatus = backlogSchema.enum('card_status', [
  'CREATED',
  'PRIORITIZED',
  'REFINED',
  'IN_PROGRESS',
  'TESTING',
  'HOMOLOGATED',
  'DONE',
  'DEPLOYED',
]);

export const backlogCards = backlogSchema.table('cards', {
  id: uuid('id').primaryKey(),
  title: text('title').notNull(),
  description: text('description').notNull(),
  type: backlogCardType('type').notNull(),
  status: backlogCardStatus('status').notNull(),
  // Controle otimista de concorrência: incrementada a cada gravação.
  version: integer('version').notNull().default(1),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
  statusChangedAt: timestamp('status_changed_at', { withTimezone: true }).notNull(),
});
