import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

  BFF_PORT: z.coerce.number().int().min(1).max(65535),

  BFF_BASE_URL: z.url(),

  WEB_BASE_URL: z.url(),

  COOKIE_SECRET: z.string().min(32),

  DATABASE_URL: z.url({ protocol: /^postgres(?:ql)?$/u }),
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
