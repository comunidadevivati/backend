import { z } from 'zod';

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

    BFF_PORT: z.coerce.number().int().min(1).max(65535),

    BFF_BASE_URL: z.url(),

    WEB_BASE_URL: z.url(),

    COOKIE_SECRET: z.string().min(32),

    DATABASE_URL: z.url({ protocol: /^postgres(?:ql)?$/u }),

    EMAIL_PROVIDER: z.enum(['disabled', 'resend']).default('disabled'),

    RESEND_API_KEY: z.string().startsWith('re_').optional(),

    EMAIL_FROM: z.string().min(3).optional(),

    PASSWORD_RESET_TTL_MINUTES: z.coerce.number().int().min(5).max(60).default(15),

    PASSWORD_RESET_COOLDOWN_SECONDS: z.coerce.number().int().min(0).max(3600).default(60),

    EMAIL_SEND_TIMEOUT_MS: z.coerce.number().int().min(1000).max(15_000).default(5000),
  })
  .superRefine((config, context) => {
    if (config.EMAIL_PROVIDER !== 'resend') {
      return;
    }

    if (!config.RESEND_API_KEY) {
      context.addIssue({ code: 'custom', path: ['RESEND_API_KEY'], message: 'Required' });
    }

    if (!config.EMAIL_FROM) {
      context.addIssue({ code: 'custom', path: ['EMAIL_FROM'], message: 'Required' });
    }
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
