import { err, ok, type Result } from '../../../shared/domain/result.js';
import { notFound, type GalleryError } from './gallery-errors.js';
import { publicVariantKey } from './media-keys.js';
import type {
  PublicAlbumRow,
  PublicGalleryReader,
  PublicMediaUrls,
  PublicPhotoRow,
} from './ports.js';

// Contratos do site público: somente o necessário para exibir, sem IDs internos de controle
// (versão, chave de publicação) nem fotos ou álbuns não publicados.
interface PublicPhotoVariant {
  width: number;
  avif: string;
  webp: string;
}

export interface PublicPhotoView {
  id: string;
  width: number;
  height: number;
  placeholder: string | null;
  // Da menor para a maior largura (srcset).
  variants: PublicPhotoVariant[];
}

export interface PublicAlbumView {
  slug: string;
  title: string;
  description: string | null;
  occurredOn: string;
  publishedAt: string | null;
  photoCount: number;
  cover: PublicPhotoView | null;
}

export interface PublicPage<T> {
  items: T[];
  nextCursor: string | null;
}

export interface PublicListQuery {
  cursor: string | null;
  limit: number;
}

// Monta as URLs das variantes de uma foto publicada.
export class PublicPhotoViews {
  constructor(private readonly urls: PublicMediaUrls) {}

  async of({
    albumId,
    height,
    id,
    placeholder,
    publicationKey,
    variantWidths,
    width,
  }: PublicPhotoRow): Promise<PublicPhotoView> {
    const variants = await Promise.all(
      variantWidths.map(async (variantWidth) => {
        const [avif, webp] = await Promise.all([
          this.urls.urlOf(publicVariantKey(albumId, id, publicationKey, variantWidth, 'avif')),
          this.urls.urlOf(publicVariantKey(albumId, id, publicationKey, variantWidth, 'webp')),
        ]);

        return avif && webp ? [{ width: variantWidth, avif, webp }] : [];
      }),
    );

    return { id, width, height, placeholder, variants: variants.flat() };
  }

  async album({
    cover,
    description,
    occurredOn,
    photoCount,
    publishedAt,
    slug,
    title,
  }: PublicAlbumRow): Promise<PublicAlbumView> {
    return {
      slug,
      title,
      description,
      occurredOn,
      publishedAt,
      photoCount,
      cover: cover ? await this.of(cover) : null,
    };
  }
}

// Paginação por cursor: o cursor é o ID do último item; busca um a mais para saber se há próxima.
const page = <T>(rows: T[], limit: number, idOf: (row: T) => string) => {
  const items = rows.slice(0, limit);

  const last = items.at(-1);

  return { items, nextCursor: rows.length > limit && last ? idOf(last) : null };
};

export class ListPublicAlbumsUseCase {
  constructor(
    private readonly reader: PublicGalleryReader,
    private readonly views: PublicPhotoViews,
  ) {}

  async execute({ cursor, limit }: PublicListQuery): Promise<PublicPage<PublicAlbumView>> {
    const rows = await this.reader.listAlbums({ after: cursor, limit: limit + 1 });

    const { items, nextCursor } = page(rows, limit, ({ id }) => id);

    return {
      items: await Promise.all(items.map((row) => this.views.album(row))),
      nextCursor,
    };
  }
}

export class GetPublicAlbumUseCase {
  constructor(
    private readonly reader: PublicGalleryReader,
    private readonly views: PublicPhotoViews,
  ) {}

  async execute(slug: string): Promise<Result<PublicAlbumView, GalleryError>> {
    const row = await this.reader.findAlbumBySlug(slug);

    return row ? ok(await this.views.album(row)) : err(notFound);
  }
}

export class ListPublicPhotosUseCase {
  constructor(
    private readonly reader: PublicGalleryReader,
    private readonly views: PublicPhotoViews,
  ) {}

  async execute(
    slug: string,
    { cursor, limit }: PublicListQuery,
  ): Promise<Result<PublicPage<PublicPhotoView>, GalleryError>> {
    const album = await this.reader.findAlbumBySlug(slug);

    if (!album) {
      return err(notFound);
    }

    const rows = await this.reader.listPhotos({
      albumId: album.id,
      after: cursor,
      limit: limit + 1,
    });

    const { items, nextCursor } = page(rows, limit, ({ id }) => id);

    return ok({ items: await Promise.all(items.map((row) => this.views.of(row))), nextCursor });
  }
}
