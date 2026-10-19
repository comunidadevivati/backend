import { z } from 'zod';

// Transporte: somente tipos e limites de tamanho. Formatos (CNPJ, CEP, UF, telefone, e-mail) são
// invariantes dos Value Objects e validados no Domain, que aceita entradas com máscara.
const text = z.string().max(300);

const nullableText = text.nullable();

const addressSchema = z.strictObject({
  street: text,
  number: text,
  complement: nullableText.default(null),
  district: text,
  city: text,
  state: text,
  postalCode: text,
});

const version = z.number().int().min(1);

export const updateOrganizationSchema = z.strictObject({
  version,
  legalName: text.optional(),
  tradeName: text.optional(),
  cnpj: text.optional(),
  address: addressSchema.partial().optional(),
  phone: text.optional(),
  email: text.optional(),
});

export const registerCongregationSchema = z.strictObject({
  code: text,
  name: text,
  cnpj: nullableText.default(null),
  address: addressSchema,
  phone: nullableText.default(null),
  email: nullableText.default(null),
});

export const updateCongregationSchema = z.strictObject({
  version,
  name: text.optional(),
  cnpj: nullableText.optional(),
  address: addressSchema.partial().optional(),
  phone: nullableText.optional(),
  email: nullableText.optional(),
});

export const listCongregationsSchema = z.object({
  status: z.enum(['DRAFT', 'ACTIVE', 'INACTIVE']).nullable().default(null),
  cursor: z.uuid().nullable().default(null),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const congregationIdSchema = z.uuid();

// Campos recusados pelo transporte, no mesmo formato de caminho usado pelo Domain.
export const parseOrThrow = <T>(
  schema: z.ZodType<T>,
  input: unknown,
  onError: (fields: string[]) => never,
): T => {
  const result = schema.safeParse(input ?? {});

  if (!result.success) {
    return onError([...new Set(result.error.issues.map(({ path }) => path.join('.') || 'body'))]);
  }

  return result.data;
};
