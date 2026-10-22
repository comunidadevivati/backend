import { z } from 'zod';
import { AVATAR_CONTENT_TYPES } from '../application/person.use-cases.js';
import { SEXES } from '../domain/person.js';

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

// Cadastro do Perfil (substituição completa). O e-mail principal não entra: é o e-mail de acesso.
const homeAddressSchema = z.strictObject({
  street: text,
  number: text,
  complement: nullableText.default(null),
  district: text,
  city: text,
  state: text,
  postalCode: text,
  country: text.default(''),
  reference: nullableText.default(null),
});

const socialLinksSchema = z.strictObject({
  instagram: nullableText.default(null),
  facebook: nullableText.default(null),
  linkedin: nullableText.default(null),
  twitter: nullableText.default(null),
  youtube: nullableText.default(null),
});

export const updatePersonSchema = z.strictObject({
  version: z.number().int().min(1),
  fullName: text,
  sex: z.enum(SEXES).nullable().default(null),
  birthDate: nullableText.default(null),
  phone: nullableText.default(null),
  secondaryPhone: nullableText.default(null),
  secondaryEmail: nullableText.default(null),
  address: homeAddressSchema.nullable().default(null),
  socialLinks: socialLinksSchema.default({
    instagram: null,
    facebook: null,
    linkedin: null,
    twitter: null,
    youtube: null,
  }),
});

// Troca do e-mail de acesso, já confirmada pelo BFF no novo endereço.
export const changePersonEmailSchema = z.strictObject({ email: text });

export const requestAvatarUploadSchema = z.strictObject({
  contentType: z.enum(AVATAR_CONTENT_TYPES),
});

export const completeAvatarUploadSchema = z.strictObject({ uploadId: z.uuid() });

export const resourceIdSchema = z.uuid();
