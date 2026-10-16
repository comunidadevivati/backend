import { z } from 'zod';
import { isValidBrazilianPhone } from '../domain/policies/brazilian-phone.js';
import { isValidFullName, normalizeFullName } from '../domain/policies/full-name.js';
import {
  getPersonalInfoTerms,
  isWeakPassword,
  PASSWORD_MAX_LENGTH,
} from '../domain/policies/password-policy.js';

// Contrato de POST /auth/register: { name, phone, email, password }, telefone só com dígitos.
export const registerRequestSchema = z
  .object({
    name: z.string().transform(normalizeFullName).refine(isValidFullName),
    phone: z.string().refine(isValidBrazilianPhone),
    email: z.string().trim().toLowerCase().pipe(z.email().max(254)),
    password: z.string().max(PASSWORD_MAX_LENGTH),
  })
  .refine(
    ({ email, name, password }) => !isWeakPassword(password, getPersonalInfoTerms(name, email)),
    { path: ['password'] },
  );
