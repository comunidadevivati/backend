import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq, gt, lt, ne, sql, type SQL } from 'drizzle-orm';
import { isUniqueViolation } from '../../../shared/infrastructure/database/database-errors.js';
import { DatabaseService } from '../../../shared/infrastructure/database/database.service.js';
import {
  AlbumRepository,
  PhotoRepository,
  type AlbumListQuery,
  type AlbumView,
  type PhotoListQuery,
} from '../application/ports.js';
import { Album } from '../domain/album.js';
import {
  Photo,
  type AcceptedPhotoType,
  type PhotoSnapshot,
  type PhotoStatus,
} from '../domain/photo.js';
import { albums, photos } from './database/gallery.schema.js';
import type { Database } from '../../../shared/infrastructure/database/database.js';

// Os registros Drizzle não saem desta camada: são convertidos em snapshots do Domain.

type PhotoRow = typeof photos.$inferSelect;

const nextVersion = {
  version: sql<number>`${sql.raw('version')} + 1`,
  updatedAt: sql`now()`,
};

const albumColumns = {
  id: albums.id,
  slug: albums.slug,
  title: albums.title,
  description: albums.description,
  occurredOn: albums.occurredOn,
  coverPhotoId: albums.coverPhotoId,
  status: albums.status,
  publishedAt: sql<
    string | null
  >`to_char(${albums.publishedAt} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')`,
  version: albums.version,
};

const albumViewColumns = {
  ...albumColumns,
  // Coluna qualificada à mão: o Drizzle não qualifica colunas em consultas de uma tabela só, e o
  // "id" sem tabela seria resolvido para a foto dentro da subconsulta.
  photoCount: sql<number>`(
    select count(*)::int from gallery.photos p
    where p.album_id = "albums"."id" and p.status = 'READY'
  )`,
};

const toPhotoSnapshot = (row: PhotoRow): PhotoSnapshot => ({
  id: row.id,
  albumId: row.albumId,
  status: row.status,
  contentType: row.contentType as AcceptedPhotoType,
  byteSize: row.byteSize,
  width: row.width,
  height: row.height,
  placeholder: row.placeholder,
  variantWidths: row.variantWidths,
  failure: row.failure,
  version: row.version,
});

@Injectable()
export class DrizzleAlbumRepository extends AlbumRepository {
  private readonly db: Database;

  constructor(@Inject(DatabaseService) databaseService: DatabaseService) {
    super();

    this.db = databaseService.db;
  }

  async findById(id: string): Promise<Album | null> {
    const [snapshot] = await this.db
      .select(albumColumns)
      .from(albums)
      .where(eq(albums.id, id))
      .limit(1);

    return snapshot ? Album.restore(snapshot) : null;
  }

  async findView(id: string): Promise<AlbumView | null> {
    const [view] = await this.db
      .select(albumViewColumns)
      .from(albums)
      .where(eq(albums.id, id))
      .limit(1);

    return view ?? null;
  }

  // Ordem: data do evento e criação, mais recentes primeiro. O cursor é o ID do último item, e a
  // posição dele é relida para continuar a ordenação composta.
  list({ after, limit, status }: AlbumListQuery): Promise<AlbumView[]> {
    const filters: SQL[] = [];

    if (status) {
      filters.push(eq(albums.status, status));
    }

    if (after) {
      filters.push(
        sql`(${albums.occurredOn}, ${albums.id}) < (
          select a.occurred_on, a.id from gallery.albums a where a.id = ${after}
        )`,
      );
    }

    return this.db
      .select(albumViewColumns)
      .from(albums)
      .where(and(...filters))
      .orderBy(sql`${albums.occurredOn} desc`, sql`${albums.id} desc`)
      .limit(limit);
  }

  async insert(album: Album): Promise<'inserted' | 'slug_taken'> {
    const { coverPhotoId, description, id, occurredOn, slug, status, title } = album.toSnapshot();

    try {
      await this.db
        .insert(albums)
        .values({ id, slug, title, description, occurredOn, coverPhotoId, status });
    } catch (error) {
      if (isUniqueViolation(error)) {
        return 'slug_taken';
      }

      throw error;
    }

    return 'inserted';
  }

  async update(album: Album): Promise<number | null> {
    const { coverPhotoId, description, id, occurredOn, status, title, version } =
      album.toSnapshot();

    const [row] = await this.db
      .update(albums)
      .set({ title, description, occurredOn, coverPhotoId, status, ...nextVersion })
      .where(and(eq(albums.id, id), eq(albums.version, version)))
      .returning({ version: albums.version });

    return row?.version ?? null;
  }
}

@Injectable()
export class DrizzlePhotoRepository extends PhotoRepository {
  private readonly db: Database;

  constructor(@Inject(DatabaseService) databaseService: DatabaseService) {
    super();

    this.db = databaseService.db;
  }

  async findById(id: string): Promise<Photo | null> {
    const [row] = await this.db.select().from(photos).where(eq(photos.id, id)).limit(1);

    return row ? Photo.restore(toPhotoSnapshot(row)) : null;
  }

  async listByAlbum({ after, albumId, limit }: PhotoListQuery): Promise<PhotoSnapshot[]> {
    const filters: SQL[] = [eq(photos.albumId, albumId), ne(photos.status, 'PENDING_UPLOAD')];

    if (after) {
      filters.push(gt(photos.id, after));
    }

    const rows = await this.db
      .select()
      .from(photos)
      .where(and(...filters))
      .orderBy(asc(photos.id))
      .limit(limit);

    return rows.map((row) => toPhotoSnapshot(row));
  }

  async countByAlbum(albumId: string): Promise<number> {
    const [row] = await this.db
      .select({ total: sql<number>`count(*)::int` })
      .from(photos)
      .where(eq(photos.albumId, albumId));

    return row?.total ?? 0;
  }

  async listByStatus(status: PhotoStatus): Promise<PhotoSnapshot[]> {
    const rows = await this.db
      .select()
      .from(photos)
      .where(eq(photos.status, status))
      .orderBy(asc(photos.id));

    return rows.map((row) => toPhotoSnapshot(row));
  }

  async insertMany(items: readonly Photo[]): Promise<void> {
    if (items.length === 0) {
      return;
    }

    await this.db.insert(photos).values(
      items.map((photo) => {
        const { albumId, byteSize, contentType, id, status } = photo.toSnapshot();

        return { id, albumId, status, contentType, byteSize };
      }),
    );
  }

  async update(photo: Photo): Promise<number | null> {
    const { byteSize, failure, height, id, placeholder, status, variantWidths, version, width } =
      photo.toSnapshot();

    const [row] = await this.db
      .update(photos)
      .set({ status, byteSize, width, height, placeholder, variantWidths, failure, ...nextVersion })
      .where(and(eq(photos.id, id), eq(photos.version, version)))
      .returning({ version: photos.version });

    return row?.version ?? null;
  }

  async delete(id: string): Promise<void> {
    await this.db.delete(photos).where(eq(photos.id, id));
  }

  async deletePendingCreatedBefore(albumId: string, before: Date): Promise<void> {
    await this.db
      .delete(photos)
      .where(
        and(
          eq(photos.albumId, albumId),
          eq(photos.status, 'PENDING_UPLOAD'),
          lt(photos.createdAt, before),
        ),
      );
  }
}
