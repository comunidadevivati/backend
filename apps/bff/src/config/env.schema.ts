import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

  BFF_PORT: z.coerce.number().int().min(1).max(65535),

  BFF_BASE_URL: z.url(),

  BFF_OIDC_CALLBACK_URL: z.url(),

  WEB_BASE_URL: z.url(),

  KEYCLOAK_ISSUER: z.url(),

  KEYCLOAK_CLIENT_ID: z.string().min(1),

  KEYCLOAK_CLIENT_SECRET: z.string().min(1),

  COOKIE_SECRET: z.string().min(32),

  SESSION_ENCRYPTION_KEY: z.string().regex(/^[A-Za-z0-9_-]{43}$/u),

  REDIS_URL: z.url(),
});

export const validateEnv = (config: Record<string, unknown>) => {
  const result = envSchema.safeParse(config);

  if (!result.success) {
    throw new Error(
      `Invalid environment configuration: ${result.error.issues
        .map((issue) => issue.path.join('.'))
        .join(', ')}`,
    );
  }

  return result.data;
};
