import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgSchema,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import type { DeliveryStatus, FormAnswer } from '../../domain/form-invitation.js';
import type { FormQuestion } from '../../domain/form.js';

// Schema de propriedade exclusiva do contexto Forms (ADR 0013).
export const formsSchema = pgSchema('forms');

export const formStatus = formsSchema.enum('form_status', [
  'DRAFT',
  'PUBLISHED',
  'FINISHED',
  'CANCELLED',
]);

export const emailDispatchStatus = formsSchema.enum('email_dispatch_status', [
  'SENDING',
  'SENT',
  'FAILED',
]);

export const invitationStatus = formsSchema.enum('invitation_status', ['PENDING', 'ANSWERED']);

export const answerChannel = formsSchema.enum('answer_channel', ['DIGITAL', 'PAPER']);

export const forms = formsSchema.table(
  'forms',
  {
    id: uuid('id').primaryKey(),
    // Código do departamento (catálogo em código, ex.: leadership).
    department: text('department').notNull(),
    title: text('title').notNull(),
    description: text('description'),
    startsOn: date('starts_on', { mode: 'string' }).notNull(),
    endsOn: date('ends_on', { mode: 'string' }).notNull(),
    status: formStatus('status').notNull().default('DRAFT'),
    // Perguntas e opções são Value Objects do Aggregate: gravadas juntas, na ordem de exibição.
    questions: jsonb('questions').$type<FormQuestion[]>().notNull(),
    // Grupos de e-mails do contexto Communication (referência estável por ID).
    recipientGroupIds: uuid('recipient_group_ids').array().notNull().default([]),
    // Configurações de resposta (anonimato, edição até o fim do período, consentimento LGPD).
    anonymous: boolean('anonymous').notNull().default(false),
    allowAnswerEdit: boolean('allow_answer_edit').notNull().default(false),
    consentText: text('consent_text'),
    // Imagem do cabeçalho processada; a chave do objeto no bucket é derivada do ID do formulário.
    headerImageKey: text('header_image_key'),
    headerImageWidth: integer('header_image_width'),
    headerImageHeight: integer('header_image_height'),
    headerImageContentType: text('header_image_content_type'),
    headerImageByteSize: integer('header_image_byte_size'),
    // Último envio dos e-mails aos grupos (feito pelo BFF).
    emailDispatchId: uuid('email_dispatch_id'),
    emailDispatchStatus: emailDispatchStatus('email_dispatch_status'),
    emailDispatchKind: text('email_dispatch_kind').$type<'INVITE' | 'REMINDER'>(),
    emailDispatchStartedAt: timestamp('email_dispatch_started_at', { withTimezone: true }),
    emailDispatchFinishedAt: timestamp('email_dispatch_finished_at', { withTimezone: true }),
    emailDispatchSentCount: integer('email_dispatch_sent_count').notNull().default(0),
    emailDispatchFailedCount: integer('email_dispatch_failed_count').notNull().default(0),
    answersPurgedAt: timestamp('answers_purged_at', { withTimezone: true }),
    // Controle otimista de concorrência: incrementada a cada gravação.
    version: integer('version').notNull().default(1),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('forms_department_id_idx').on(table.department, table.id)],
);

// Convite de uma conta para responder o formulário, com a resposta digital (uma por convite).
export const formInvitations = formsSchema.table(
  'form_invitations',
  {
    id: uuid('id').primaryKey(),
    formId: uuid('form_id')
      .notNull()
      .references(() => forms.id, { onDelete: 'cascade' }),
    // Conta do BFF (auth.users); nome e e-mail do momento do envio.
    accountId: uuid('account_id').notNull(),
    recipientName: text('recipient_name').notNull(),
    recipientEmail: text('recipient_email').notNull(),
    // SHA-256 do token do link; o token em si nunca é gravado.
    tokenHash: text('token_hash').notNull().unique(),
    status: invitationStatus('status').notNull().default('PENDING'),
    sentAt: timestamp('sent_at', { withTimezone: true }).notNull(),
    answeredAt: timestamp('answered_at', { withTimezone: true }),
    answerChannel: answerChannel('answer_channel'),
    // Entrega do último e-mail (webhook do Resend): ID da mensagem e situação mais recente.
    emailMessageId: text('email_message_id'),
    deliveryStatus: text('delivery_status').$type<DeliveryStatus>(),
    deliveryUpdatedAt: timestamp('delivery_updated_at', { withTimezone: true }),
    // Formulário em papel digitalizado (chave do objeto no bucket e dados do arquivo).
    paperAttachmentKey: text('paper_attachment_key'),
    paperAttachmentFileName: text('paper_attachment_file_name'),
    paperAttachmentContentType: text('paper_attachment_content_type'),
    paperAttachmentByteSize: integer('paper_attachment_byte_size'),
    answers: jsonb('answers').$type<FormAnswer[]>().notNull().default([]),
    version: integer('version').notNull().default(1),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique('form_invitations_form_account_key').on(table.formId, table.accountId),
    index('form_invitations_email_message_id_idx').on(table.emailMessageId),
  ],
);

// Respostas de formulários anônimos: sem vínculo com o convite nem com a pessoa, e só com a data.
export const formAnonymousResponses = formsSchema.table(
  'form_anonymous_responses',
  {
    id: uuid('id').primaryKey(),
    formId: uuid('form_id')
      .notNull()
      .references(() => forms.id, { onDelete: 'cascade' }),
    answers: jsonb('answers').$type<FormAnswer[]>().notNull(),
    submittedOn: date('submitted_on', { mode: 'string' }).notNull(),
  },
  (table) => [index('form_anonymous_responses_form_id_idx').on(table.formId)],
);
