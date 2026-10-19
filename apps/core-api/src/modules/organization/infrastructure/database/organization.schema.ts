import { sql } from 'drizzle-orm';
import {
  boolean,
  index,
  integer,
  pgSchema,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

// Schema de propriedade exclusiva do contexto Organization.
export const organizationSchema = pgSchema('organization');

export const organizationStatus = organizationSchema.enum('organization_status', [
  'ACTIVE',
  'INACTIVE',
]);

export const congregationStatus = organizationSchema.enum('congregation_status', [
  'DRAFT',
  'ACTIVE',
  'INACTIVE',
]);

// Endereço, CNPJ (14 dígitos), telefone (somente dígitos) e e-mail são normalizados pelo Domain.
const addressColumns = {
  street: text('street').notNull(),
  number: text('number').notNull(),
  complement: text('complement'),
  district: text('district').notNull(),
  city: text('city').notNull(),
  state: text('state').notNull(),
  postalCode: text('postal_code').notNull(),
};

const auditColumns = {
  // Controle otimista de concorrência: incrementada a cada gravação.
  version: integer('version').notNull().default(1),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
};

export const organizations = organizationSchema.table('organizations', {
  id: uuid('id').primaryKey(),
  legalName: text('legal_name').notNull(),
  tradeName: text('trade_name').notNull(),
  cnpj: text('cnpj').notNull().unique(),
  ...addressColumns,
  phone: text('phone').notNull(),
  email: text('email').notNull(),
  status: organizationStatus('status').notNull().default('ACTIVE'),
  ...auditColumns,
});

export const congregations = organizationSchema.table(
  'congregations',
  {
    id: uuid('id').primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id),
    code: text('code').notNull(),
    name: text('name').notNull(),
    cnpj: text('cnpj'),
    ...addressColumns,
    phone: text('phone'),
    email: text('email'),
    headquarters: boolean('headquarters').notNull().default(false),
    status: congregationStatus('status').notNull().default('DRAFT'),
    ...auditColumns,
  },
  (table) => [
    uniqueIndex('congregations_code_uidx').on(table.code),
    // No máximo uma Sede por organização.
    uniqueIndex('congregations_headquarters_uidx')
      .on(table.organizationId)
      .where(sql`${table.headquarters}`),
    index('congregations_organization_id_idx').on(table.organizationId),
    index('congregations_status_idx').on(table.status),
  ],
);
