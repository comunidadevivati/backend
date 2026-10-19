import { z } from 'zod';
import { isValidBrazilianPhone } from '../domain/policies/brazilian-phone.js';
import { isValidFullName, normalizeFullName } from '../domain/policies/full-name.js';

// Criação: o mesmo contrato e as mesmas regras do cadastro público (POST /auth/register).
export { registerRequestSchema as createUserRequestSchema } from './register-request.schema.js';

// Alteração parcial: nome, telefone (só dígitos) e e-mail, com as regras do cadastro. A senha não
// é alterada aqui; a pessoa usa a recuperação de senha.
export const updateUserRequestSchema = z.strictObject({
  name: z.string().transform(normalizeFullName).refine(isValidFullName).optional(),
  phone: z.string().refine(isValidBrazilianPhone).optional(),
  email: z.string().trim().toLowerCase().pipe(z.email().max(254)).optional(),
});

export const listUsersRequestSchema = z.object({
  status: z.enum(['ACTIVE', 'SUSPENDED']).nullable().default(null),
  // "true" = somente e-mails verificados; "false" = somente não verificados.
  emailVerified: z
    .enum(['true', 'false'])
    .transform((value) => value === 'true')
    .nullable()
    .default(null),
  search: z
    .string()
    .trim()
    .max(254)
    .transform((value) => value || null)
    .nullable()
    .default(null),
  cursor: z.uuid().nullable().default(null),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const userIdSchema = z.uuid();
