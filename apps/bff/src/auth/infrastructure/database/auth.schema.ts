import { index, pgSchema, text, timestamp, uuid } from 'drizzle-orm/pg-core';

export const authSchema = pgSchema('auth');

export const userStatus = authSchema.enum('user_status', ['ACTIVE', 'SUSPENDED']);

export const users = authSchema.table('users', {
  id: uuid('id').primaryKey(),
  // Sempre normalizado (trim + minúsculas) pela aplicação antes de gravar ou consultar.
  email: text('email').notNull().unique(),
  name: text('name').notNull(),
  passwordHash: text('password_hash').notNull(),
  status: userStatus('status').notNull().default('ACTIVE'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const sessions = authSchema.table(
  'sessions',
  {
    // SHA-256 do token do cookie: um vazamento do banco não permite reutilizar sessões.
    tokenHash: text('token_hash').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    csrfToken: text('csrf_token').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  },
  (table) => [
    index('sessions_user_id_idx').on(table.userId),
    index('sessions_expires_at_idx').on(table.expiresAt),
  ],
);
