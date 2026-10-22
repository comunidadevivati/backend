import { boolean, index, pgSchema, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

export const authSchema = pgSchema('auth');

export const userStatus = authSchema.enum('user_status', ['ACTIVE', 'SUSPENDED']);

export const users = authSchema.table('users', {
  id: uuid('id').primaryKey(),
  // Sempre normalizado (trim + minúsculas) pela aplicação antes de gravar ou consultar.
  email: text('email').notNull().unique(),
  name: text('name').notNull(),
  // Somente dígitos (DDD + número). Opcional para contas criadas pelo CLI.
  phone: text('phone'),
  passwordHash: text('password_hash').notNull(),
  status: userStatus('status').notNull().default('ACTIVE'),
  // Preenchido quando a pessoa confirma o e-mail pelo link enviado; nulo = e-mail não verificado.
  emailVerifiedAt: timestamp('email_verified_at', { withTimezone: true }),
  // Momento da suspensão; nulo enquanto a conta está ativa.
  suspendedAt: timestamp('suspended_at', { withTimezone: true }),
  // Pessoa (cadastro completo, na Core API) gerada a partir desta conta verificada, ao virar membro;
  // nula enquanto não houver. Identity é dono do vínculo; sem chave estrangeira entre schemas.
  personId: uuid('person_id').unique(),
  // Inscrição para receber notícias por e-mail (preferência de comunicação da conta) e quando mudou.
  newsOptIn: boolean('news_opt_in').notNull().default(false),
  newsOptInUpdatedAt: timestamp('news_opt_in_updated_at', { withTimezone: true }),
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

export const passwordResetTokens = authSchema.table(
  'password_reset_tokens',
  {
    id: uuid('id').primaryKey(),
    // Somente o SHA-256 é persistido; o token original existe apenas no e-mail enviado.
    tokenHash: text('token_hash').notNull(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    usedAt: timestamp('used_at', { withTimezone: true }),
  },
  (table) => [
    uniqueIndex('password_reset_tokens_token_hash_uidx').on(table.tokenHash),
    index('password_reset_tokens_user_id_idx').on(table.userId),
    index('password_reset_tokens_expires_at_idx').on(table.expiresAt),
  ],
);

export const emailVerificationTokens = authSchema.table(
  'email_verification_tokens',
  {
    id: uuid('id').primaryKey(),
    // Somente o SHA-256 é persistido; o token original existe apenas no e-mail enviado.
    tokenHash: text('token_hash').notNull(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    usedAt: timestamp('used_at', { withTimezone: true }),
  },
  (table) => [
    uniqueIndex('email_verification_tokens_token_hash_uidx').on(table.tokenHash),
    index('email_verification_tokens_user_id_idx').on(table.userId),
    index('email_verification_tokens_expires_at_idx').on(table.expiresAt),
  ],
);

// Troca do e-mail de acesso: o novo e-mail só passa a valer quando o link enviado a ele é aberto.
export const emailChangeTokens = authSchema.table(
  'email_change_tokens',
  {
    id: uuid('id').primaryKey(),
    // Somente o SHA-256 é persistido; o token original existe apenas no e-mail enviado.
    tokenHash: text('token_hash').notNull(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    // Já normalizado (trim + minúsculas).
    newEmail: text('new_email').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    usedAt: timestamp('used_at', { withTimezone: true }),
  },
  (table) => [
    uniqueIndex('email_change_tokens_token_hash_uidx').on(table.tokenHash),
    index('email_change_tokens_user_id_idx').on(table.userId),
    index('email_change_tokens_expires_at_idx').on(table.expiresAt),
  ],
);
