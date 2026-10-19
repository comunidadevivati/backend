import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

  PORT: z.coerce.number().int().min(1).max(65535).default(3001),

  // Mesmo banco do BFF em cada ambiente, com um schema por Bounded Context (ex.: organization).
  DATABASE_URL: z.url({ protocol: /^postgres(?:ql)?$/u }),

  // Credencial compartilhada somente com o BFF (ADR 0006).
  CORE_API_TOKEN: z.string().min(32),
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
