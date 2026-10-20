import type { z } from 'zod';

// Valida o corpo ou a query no transporte. Em caso de erro, entrega os campos recusados no formato
// de caminho do contrato (ex.: address.postalCode; "body" quando o próprio corpo é inválido).
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
