import { z } from 'zod';

// Transporte: somente tipos e limites de tamanho. Formatos (nome, data, telefone, e-mail) são
// invariantes dos Value Objects e validados no Domain, que aceita entradas com máscara.
const text = z.string().max(300);

const nullableText = text.nullable();

// Conta verificada (BFF) que vira Pessoa e membro, com os dados copiados da conta.
export const enrollMemberSchema = z.strictObject({
  accountId: z.uuid(),
  fullName: text,
  birthDate: nullableText.default(null),
  phone: nullableText.default(null),
  email: nullableText.default(null),
});

export const listMembersSchema = z.object({
  status: z.enum(['ACTIVE', 'INACTIVE', 'ARCHIVED']).nullable().default(null),
  congregationId: z.uuid().nullable().default(null),
  search: z
    .string()
    .trim()
    .max(120)
    .transform((value) => value || null)
    .nullable()
    .default(null),
  cursor: z.uuid().nullable().default(null),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const registerMembershipSchema = z.strictObject({
  // Formato UUID; a existência é verificada no contexto Organization.
  congregationId: z.uuid(),
  primary: z.boolean().default(false),
});

export const resourceIdSchema = z.uuid();
