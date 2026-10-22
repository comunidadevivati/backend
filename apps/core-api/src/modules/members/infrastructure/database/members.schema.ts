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

export const personSex = membersSchema.enum('person_sex', ['MALE', 'FEMALE']);

// Pessoa: cadastro completo, originado de uma conta verificada do BFF. account_id referencia a conta
// somente pelo ID estável (sem chave estrangeira entre schemas) e é único: uma Pessoa por conta.
// Nome, telefones (somente dígitos), e-mails (minúsculas), endereço e links são normalizados pelo
// Domain. O endereço é todo nulo ou todo preenchido (exceto complemento e referência).
export const people = membersSchema.table('people', {
  id: uuid('id').primaryKey(),
  accountId: uuid('account_id').notNull().unique(),
  fullName: text('full_name').notNull(),
  sex: personSex('sex'),
  birthDate: date('birth_date', { mode: 'string' }),
  phone: text('phone'),
  secondaryPhone: text('secondary_phone'),
  // E-mail de acesso da conta, acompanhado pelo BFF a cada troca confirmada.
  email: text('email'),
  secondaryEmail: text('secondary_email'),
  addressStreet: text('address_street'),
  addressNumber: text('address_number'),
  addressComplement: text('address_complement'),
  addressDistrict: text('address_district'),
  addressCity: text('address_city'),
  addressState: text('address_state'),
  addressPostalCode: text('address_postal_code'),
  addressCountry: text('address_country'),
  addressReference: text('address_reference'),
  instagramUrl: text('instagram_url'),
  facebookUrl: text('facebook_url'),
  linkedinUrl: text('linkedin_url'),
  twitterUrl: text('twitter_url'),
  youtubeUrl: text('youtube_url'),
  // Identificador da foto atual no bucket de mídia (área privada).
  avatarKey: text('avatar_key'),
  ...auditColumns,
});

// Membro: participação de uma Pessoa na comunidade, sem dados pessoais. Uma Pessoa, um membro.
export const members = membersSchema.table(
  'members',
  {
    id: uuid('id').primaryKey(),
    personId: uuid('person_id')
      .notNull()
      .unique()
      .references(() => people.id),
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
