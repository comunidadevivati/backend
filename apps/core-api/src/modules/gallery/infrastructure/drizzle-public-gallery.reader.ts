import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq, gt, inArray, isNotNull, sql, type SQL } from 'drizzle-orm';
import { DatabaseService } from '../../../shared/infrastructure/database/database.service.js';
import {
  PublicGalleryReader,
  type PublicAlbumListQuery,
  type PublicAlbumRow,
  type PublicPhotoListQuery,
  type PublicPhotoRow,
} from '../application/ports.js';
import { albums, photos } from './database/gallery.schema.js';
import type { Database } from '../../../shared/infrastructure/database/database.js';

// Consultas do site público: álbum PUBLISHED com ao menos uma foto publicada, e somente fotos
// publicadas (chave de publicação presente). Os registros Drizzle não saem desta camada.

const isPublishedPhoto = isNotNull(photos.publicationKey);

// Mesma qualificação manual do repositório do painel: dentro da subconsulta, "id" sem tabela
// seria resolvido para a foto.
const publishedCount = sql<number>`(
  select count(*)::int from gallery.photos p
  where p.album_id = "albums"."id" and p.publication_key is not null
)`;

const albumColumns = {
  id: albums.id,
  slug: albums.slug,
  title: albums.title,
  description: albums.description,
  occurredOn: albums.occurredOn,
  publishedAt: sql<
    string | null
  >`to_char(${albums.publishedAt} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')`,
  photoCount: publishedCount,
};

const photoColumns = {
  id: photos.id,
  albumId: photos.albumId,
  publicationKey: photos.publicationKey,
  width: photos.width,
  height: photos.height,
  placeholder: photos.placeholder,
  variantWidths: photos.variantWidths,
};

type PhotoColumns = {
  id: string;
  albumId: string;
  publicationKey: string | null;
  width: number | null;
  height: number | null;
  placeholder: string | null;
  variantWidths: number[];
};

// Foto publicada sempre está READY, com largura, altura e chave definidas.
const toPublicPhoto = (row: PhotoColumns): PublicPhotoRow => ({
  id: row.id,
  albumId: row.albumId,
  publicationKey: row.publicationKey ?? '',
  width: row.width ?? 0,
  height: row.height ?? 0,
  placeholder: row.placeholder,
  variantWidths: row.variantWidths,
});

const visibleAlbum: SQL = sql`${albums.status} = 'PUBLISHED' and ${publishedCount} > 0`;

@Injectable()
export class DrizzlePublicGalleryReader extends PublicGalleryReader {
  private readonly db: Database;

  constructor(@Inject(DatabaseService) databaseService: DatabaseService) {
    super();

    this.db = databaseService.db;
  }

  async listAlbums({ after, limit }: PublicAlbumListQuery): Promise<PublicAlbumRow[]> {
    const filters: SQL[] = [visibleAlbum];

    if (after) {
      filters.push(
        sql`(${albums.occurredOn}, ${albums.id}) < (
          select a.occurred_on, a.id from gallery.albums a where a.id = ${after}
        )`,
      );
    }

    const rows = await this.db
      .select(albumColumns)
      .from(albums)
      .where(and(...filters))
      .orderBy(sql`${albums.occurredOn} desc`, sql`${albums.id} desc`)
      .limit(limit);

    return this.withCovers(rows);
  }

  async findAlbumBySlug(slug: string): Promise<PublicAlbumRow | null> {
    const rows = await this.db
      .select(albumColumns)
      .from(albums)
      .where(and(eq(albums.slug, slug), visibleAlbum))
      .limit(1);

    const [album] = await this.withCovers(rows);

    return album ?? null;
  }

  async listPhotos({ after, albumId, limit }: PublicPhotoListQuery): Promise<PublicPhotoRow[]> {
    const filters: SQL[] = [eq(photos.albumId, albumId), isPublishedPhoto];

    if (after) {
      filters.push(gt(photos.id, after));
    }

    const rows = await this.db
      .select(photoColumns)
      .from(photos)
      .where(and(...filters))
      .orderBy(asc(photos.id))
      .limit(limit);

    return rows.map((row) => toPublicPhoto(row));
  }

  // Uma consulta para as capas de todos os álbuns da página: a capa escolhida, se publicada, ou a
  // primeira foto publicada.
  private async withCovers(rows: Omit<PublicAlbumRow, 'cover'>[]): Promise<PublicAlbumRow[]> {
    if (rows.length === 0) {
      return [];
    }

    const covers = await this.db
      .selectDistinctOn([photos.albumId], photoColumns)
      .from(photos)
      .innerJoin(albums, eq(albums.id, photos.albumId))
      .where(
        and(
          inArray(
            photos.albumId,
            rows.map(({ id }) => id),
          ),
          isPublishedPhoto,
        ),
      )
      .orderBy(
        photos.albumId,
        sql`coalesce(${photos.id} = ${albums.coverPhotoId}, false) desc`,
        asc(photos.id),
      );

    const coverByAlbum = new Map(covers.map((cover) => [cover.albumId, toPublicPhoto(cover)]));

    return rows.map((row) => ({ ...row, cover: coverByAlbum.get(row.id) ?? null }));
  }
}
