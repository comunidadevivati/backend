import { z } from 'zod';

// Transporte: somente tipos e limites de tamanho. Formatos (título, data, tipo e tamanho do
// arquivo) são regras do Domain e da Application.
const text = z.string().max(2500);

const version = z.number().int().min(1);

const cursor = z.uuid().nullable().default(null);

export const createAlbumSchema = z.strictObject({
  title: text,
  description: text.nullable().default(null),
  occurredOn: text,
});

export const updateAlbumSchema = z.strictObject({
  version,
  title: text.optional(),
  description: text.nullable().optional(),
  occurredOn: text.optional(),
});

export const listAlbumsSchema = z.object({
  status: z.enum(['DRAFT', 'PUBLISHED', 'ARCHIVED']).nullable().default(null),
  cursor,
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const listPhotosSchema = z.object({
  cursor,
  limit: z.coerce.number().int().min(1).max(100).default(60),
});

// Até 50 arquivos por pedido; o tipo e o tamanho declarados são conferidos de novo após o envio.
export const requestUploadsSchema = z.strictObject({
  files: z
    .array(
      z.strictObject({
        contentType: z.string().max(100),
        byteSize: z.number().int().min(0),
      }),
    )
    .min(1)
    .max(50),
});

export const resourceIdSchema = z.uuid();

export const setCoverSchema = z.strictObject({
  photoId: z.uuid(),
});

// Site público: páginas menores de álbuns e maiores de fotos.
export const listPublicAlbumsSchema = z.object({
  cursor,
  limit: z.coerce.number().int().min(1).max(50).default(12),
});

export const listPublicPhotosSchema = z.object({
  cursor,
  limit: z.coerce.number().int().min(1).max(100).default(48),
});

// Formato dos slugs gerados (ex.: 2026-10-19-culto-de-domingo).
export const slugSchema = z
  .string()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u)
  .max(200);
