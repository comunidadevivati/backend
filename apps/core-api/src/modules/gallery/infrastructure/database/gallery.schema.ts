import { date, index, integer, pgSchema, text, timestamp, uuid } from 'drizzle-orm/pg-core';

// Schema de propriedade exclusiva do contexto Gallery (ADR 0010).
export const gallerySchema = pgSchema('gallery');

export const albumStatus = gallerySchema.enum('album_status', ['DRAFT', 'PUBLISHED', 'ARCHIVED']);

export const photoStatus = gallerySchema.enum('photo_status', [
  'PENDING_UPLOAD',
  'PROCESSING',
  'READY',
  'FAILED',
]);

export const photoFailure = gallerySchema.enum('photo_failure', [
  'invalid_image',
  'processing_error',
]);

const auditColumns = {
  // Controle otimista de concorrência: incrementada a cada gravação.
  version: integer('version').notNull().default(1),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
};

export const albums = gallerySchema.table(
  'albums',
  {
    id: uuid('id').primaryKey(),
    // Identificador estável da URL pública (ex.: 2026-10-19-culto-de-domingo).
    slug: text('slug').notNull().unique(),
    title: text('title').notNull(),
    description: text('description'),
    occurredOn: date('occurred_on', { mode: 'string' }).notNull(),
    // Validada pela aplicação: precisa ser uma foto publicada do próprio álbum.
    coverPhotoId: uuid('cover_photo_id'),
    status: albumStatus('status').notNull().default('DRAFT'),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    ...auditColumns,
  },
  (table) => [index('albums_occurred_on_id_idx').on(table.occurredOn, table.id)],
);

// As chaves dos objetos no R2 são derivadas dos IDs (álbum e foto); não são armazenadas.
export const photos = gallerySchema.table(
  'photos',
  {
    id: uuid('id').primaryKey(),
    albumId: uuid('album_id')
      .notNull()
      .references(() => albums.id),
    status: photoStatus('status').notNull().default('PENDING_UPLOAD'),
    contentType: text('content_type').notNull(),
    byteSize: integer('byte_size').notNull(),
    width: integer('width'),
    height: integer('height'),
    // Imagem minúscula em data URI (placeholder borrado).
    placeholder: text('placeholder'),
    variantWidths: integer('variant_widths').array().notNull().default([]),
    failure: photoFailure('failure'),
    // Pasta da publicação atual na área pública do bucket; null quando a foto não está publicada.
    publicationKey: text('publication_key'),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    ...auditColumns,
  },
  (table) => [
    index('photos_album_id_id_idx').on(table.albumId, table.id),
    index('photos_status_idx').on(table.status),
  ],
);
