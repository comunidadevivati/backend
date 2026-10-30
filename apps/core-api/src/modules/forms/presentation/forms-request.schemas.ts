import { z } from 'zod';
import { HEADER_IMAGE_CONTENT_TYPES } from '../application/header-image.use-cases.js';
import { PAPER_ATTACHMENT_CONTENT_TYPES } from '../application/paper-answer.use-cases.js';
import { DELIVERY_STATUSES } from '../domain/form-invitation.js';
import { FORM_STATUSES, QUESTION_FIELD_TYPES } from '../domain/form.js';

// Transporte: somente tipos e limites de tamanho. Formatos e limites do conteúdo são regras do Domain.
const text = z.string().max(5000);

const id = z.string().max(64).nullable().default(null);

const detailsSchema = z.strictObject({
  title: text,
  description: text.nullable().default(null),
  startsOn: z.string().max(20),
  endsOn: z.string().max(20),
  status: z.enum(FORM_STATUSES),
  questions: z
    .array(
      z.strictObject({
        id,
        title: text,
        description: text.nullable().default(null),
        fieldType: z.enum(QUESTION_FIELD_TYPES),
        required: z.boolean().default(false),
        scale: z
          .strictObject({
            min: z.number().int(),
            max: z.number().int(),
            minLabel: text.nullable().default(null),
            maxLabel: text.nullable().default(null),
            pointLabels: z.array(text).max(11).nullable().default(null),
          })
          .nullable()
          .default(null),
        options: z
          .array(z.strictObject({ id, label: text }))
          .max(100)
          .default([]),
      }),
    )
    .max(200),
  recipientGroupIds: z.array(z.uuid()).max(200).default([]),
  anonymous: z.boolean().default(false),
  allowAnswerEdit: z.boolean().default(false),
  consentText: text.nullable().default(null),
});

export const createFormSchema = detailsSchema;

export const updateFormSchema = detailsSchema.extend({ version: z.number().int().min(1) });

export const changeStatusSchema = z.strictObject({
  version: z.number().int().min(1),
  status: z.enum(FORM_STATUSES),
});

export const listFormsSchema = z.object({
  status: z.enum(FORM_STATUSES).nullable().default(null),
  cursor: z.uuid().nullable().default(null),
  limit: z.coerce.number().int().min(1).max(100).default(10),
});

export const requestHeaderImageUploadSchema = z.strictObject({
  contentType: z.enum(HEADER_IMAGE_CONTENT_TYPES),
});

export const completeHeaderImageUploadSchema = z.strictObject({
  uploadId: z.uuid(),
});

export const resourceIdSchema = z.uuid();

// Conclusão do envio informada pelo BFF.
export const finishDispatchSchema = z.strictObject({
  sentCount: z.number().int().min(0),
  failedCount: z.number().int().min(0),
  deliveries: z
    .array(
      z.strictObject({
        accountId: z.uuid(),
        messageId: z.string().max(200).nullable(),
        sent: z.boolean(),
      }),
    )
    .max(5000)
    .default([]),
});

// INVITE (padrão) ou REMINDER (lembrete aos pendentes).
export const startDispatchSchema = z.strictObject({
  kind: z.enum(['INVITE', 'REMINDER']).default('INVITE'),
});

// Evento de entrega (webhook do Resend, já conferido pelo BFF).
export const deliveryEventSchema = z.strictObject({
  messageId: z.string().min(1).max(200),
  status: z.enum(DELIVERY_STATUSES),
  occurredAt: z.iso.datetime({ offset: true }),
});

// Contas resolvidas pelo BFF (nome e e-mail atuais) para os convites do envio.
export const prepareInvitationsSchema = z.strictObject({
  recipients: z
    .array(
      z.strictObject({
        accountId: z.uuid(),
        name: z.string().min(1).max(200),
        email: z.email().max(320),
      }),
    )
    .max(5000),
});

const tokenSchema = z.string().min(20).max(200);

export const lookupInvitationSchema = z.strictObject({ token: tokenSchema });

export const submitAnswersSchema = z.strictObject({
  token: tokenSchema,
  answers: z
    .array(
      z.strictObject({
        questionId: z.string().max(64),
        text: z.string().max(10_000).nullable().optional(),
        optionIds: z.array(z.string().max(64)).max(100).optional(),
        value: z.number().nullable().optional(),
      }),
    )
    .max(200),
  consentAccepted: z.boolean().default(false),
});

export const requestPaperAttachmentUploadSchema = z.strictObject({
  contentType: z.enum(PAPER_ATTACHMENT_CONTENT_TYPES),
});

export const completePaperAttachmentUploadSchema = z.strictObject({
  uploadId: z.uuid(),
  fileName: z.string().max(255).default(''),
});
