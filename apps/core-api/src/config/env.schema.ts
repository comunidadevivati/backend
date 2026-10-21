import { z } from 'zod';

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

    PORT: z.coerce.number().int().min(1).max(65535).default(3001),

    // Mesmo banco do BFF em cada ambiente, com um schema por Bounded Context (ex.: organization).
    DATABASE_URL: z.url({ protocol: /^postgres(?:ql)?$/u }),

    // Credencial compartilhada somente com o BFF (ADR 0006).
    CORE_API_TOKEN: z.string().min(32),

    // Armazenamento de mídia da galeria (ADR 0010): "disabled" desliga envios; "s3" usa o R2 (ou um
    // emulador S3 local) com as credenciais abaixo.
    MEDIA_STORAGE: z.enum(['disabled', 's3']).default('disabled'),

    // Endpoint S3 sem bucket, ex.: https://<conta>.r2.cloudflarestorage.com.
    MEDIA_S3_ENDPOINT: z.url({ protocol: /^https?$/u }).optional(),

    // "auto" no R2; emuladores locais costumam usar us-east-1.
    MEDIA_S3_REGION: z.string().min(1).default('auto'),

    MEDIA_S3_ACCESS_KEY_ID: z.string().min(1).optional(),

    MEDIA_S3_SECRET_ACCESS_KEY: z.string().min(1).optional(),

    // Bucket único de mídia, compartilhado pelos ambientes (a cota gratuita do R2 é da conta).
    MEDIA_BUCKET: z
      .string()
      .regex(/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/u)
      .optional(),

    // Pasta do ambiente dentro do bucket (ex.: prod, hml, dev), prefixada em todas as chaves.
    MEDIA_KEY_PREFIX: z
      .string()
      .regex(/^[a-z0-9][a-z0-9-]{0,31}$/u)
      .optional(),

    // Domínio público do bucket (ex.: https://media-hml.comvivaeficaz.com.br). Com ele, a zona e o
    // token de purge, as fotos despublicadas saem do cache da CDN. Opcional enquanto o domínio
    // público não está ligado.
    MEDIA_PUBLIC_BASE_URL: z.url({ protocol: /^https?$/u }).optional(),

    MEDIA_CDN_ZONE_ID: z.string().min(1).optional(),

    MEDIA_CDN_PURGE_TOKEN: z.string().min(1).optional(),
  })
  .superRefine((config, context) => {
    const cdnKeys = [
      'MEDIA_PUBLIC_BASE_URL',
      'MEDIA_CDN_ZONE_ID',
      'MEDIA_CDN_PURGE_TOKEN',
    ] as const;

    // Purge exige as três: tudo ou nada.
    if (cdnKeys.some((key) => config[key])) {
      for (const key of cdnKeys) {
        if (!config[key]) {
          context.addIssue({ code: 'custom', path: [key], message: 'Required' });
        }
      }
    }

    if (config.MEDIA_STORAGE !== 's3') {
      return;
    }

    for (const key of [
      'MEDIA_S3_ENDPOINT',
      'MEDIA_S3_ACCESS_KEY_ID',
      'MEDIA_S3_SECRET_ACCESS_KEY',
      'MEDIA_BUCKET',
      'MEDIA_KEY_PREFIX',
    ] as const) {
      if (!config[key]) {
        context.addIssue({ code: 'custom', path: [key], message: 'Required' });
      }
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
