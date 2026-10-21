import { err, ok, type Result } from '../../../shared/domain/result.js';
import {
  albumArchived,
  albumWithoutPublishedPhotos,
  coverNotPublished,
  invalidAlbumStatus,
  invalidPhotoStatus,
  notFound,
  storageDisabled,
  versionConflict,
  type GalleryError,
} from './gallery-errors.js';
import { VARIANT_FORMATS, publicVariantKey, variantKey } from './media-keys.js';
import type { Album, AlbumTransitionError } from '../domain/album.js';
import type { Photo } from '../domain/photo.js';
import type { PhotoView, PhotoViews } from './photo.use-cases.js';
import type {
  AlbumRepository,
  AlbumView,
  Clock,
  IdGenerator,
  PhotoRepository,
  PrivateMediaStorage,
} from './ports.js';
import type { PublicPhotoRemoval } from './public-photos.js';

// A chave de publicação muda a cada publicação, então a variante pública nunca muda de conteúdo.
const PUBLIC_CACHE_CONTROL = 'public, max-age=31536000, immutable';

// Fotos publicadas por chamada em "publicar todas": cada foto são até 10 cópias no bucket, e a
// resposta precisa caber no tempo limite do BFF.
const PUBLISH_BATCH_SIZE = 10;

export type AlbumStatusAction = 'publish' | 'unpublish' | 'archive' | 'restore';

export interface PublishBatchResult {
  published: number;
  // Fotos prontas que ainda aguardam publicação (o painel chama de novo enquanto houver).
  remaining: number;
}

type PhotoResult = Result<PhotoView, GalleryError>;

type AlbumResult = Result<AlbumView, GalleryError>;

const transitionError = (error: AlbumTransitionError): GalleryError =>
  error === 'album_archived' ? albumArchived : invalidAlbumStatus;

// Copia as variantes da área privada para a pública e marca a foto como publicada. Se a gravação
// falhar, as cópias são apagadas para não deixar objetos públicos sem foto publicada.
class PhotoPublisher {
  constructor(
    private readonly photos: PhotoRepository,
    private readonly storage: PrivateMediaStorage,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
  ) {}

  async publish(photo: Photo): Promise<Result<void, GalleryError>> {
    const publicationKey = this.ids.next();

    if (!photo.publish(publicationKey, this.clock.now().toISOString()).ok) {
      return err(invalidPhotoStatus);
    }

    const { albumId, id } = photo;

    const copies = photo.variantWidths.flatMap((width) =>
      VARIANT_FORMATS.map((format) => ({
        source: variantKey(albumId, id, width, format),
        target: publicVariantKey(albumId, id, publicationKey, width, format),
        contentType: `image/${format}`,
      })),
    );

    const written: string[] = [];

    try {
      for (const { contentType, source, target } of copies) {
        // oxlint-disable-next-line no-await-in-loop -- cópias sequenciais, uma requisição por vez
        await this.storage.copy(source, target, {
          contentType,
          cacheControl: PUBLIC_CACHE_CONTROL,
        });

        written.push(target);
      }

      if ((await this.photos.update(photo)) === null) {
        await this.storage.delete(written);

        return err(versionConflict);
      }
    } catch (error) {
      await this.storage.delete(written);

      throw error;
    }

    return ok();
  }
}

export class PublishPhotoUseCase {
  private readonly publisher: PhotoPublisher;

  constructor(
    private readonly albums: AlbumRepository,
    private readonly photos: PhotoRepository,
    private readonly storage: PrivateMediaStorage,
    ids: IdGenerator,
    clock: Clock,
    private readonly views: PhotoViews,
  ) {
    this.publisher = new PhotoPublisher(photos, storage, ids, clock);
  }

  async execute(photoId: string): Promise<PhotoResult> {
    if (!this.storage.enabled) {
      return err(storageDisabled);
    }

    const photo = await this.photos.findById(photoId);

    if (!photo) {
      return err(notFound);
    }

    const album = await this.albums.findById(photo.albumId);

    if (!album?.acceptsPhotos) {
      return err(albumArchived);
    }

    const published = await this.publisher.publish(photo);

    if (!published.ok) {
      return published;
    }

    return ok(await this.views.of(photo.toSnapshot()));
  }
}

// "Publicar todas": publica um lote das fotos prontas ainda não publicadas e informa quantas faltam.
export class PublishAlbumPhotosUseCase {
  private readonly publisher: PhotoPublisher;

  constructor(
    private readonly albums: AlbumRepository,
    private readonly photos: PhotoRepository,
    private readonly storage: PrivateMediaStorage,
    ids: IdGenerator,
    clock: Clock,
  ) {
    this.publisher = new PhotoPublisher(photos, storage, ids, clock);
  }

  async execute(albumId: string): Promise<Result<PublishBatchResult, GalleryError>> {
    if (!this.storage.enabled) {
      return err(storageDisabled);
    }

    const album = await this.albums.findById(albumId);

    if (!album) {
      return err(notFound);
    }

    if (!album.acceptsPhotos) {
      return err(albumArchived);
    }

    let published = 0;

    for (const photo of await this.photos.listPublishable(albumId, PUBLISH_BATCH_SIZE)) {
      // Foto alterada ao mesmo tempo (ex.: publicada por outra pessoa) é apenas ignorada.
      // oxlint-disable-next-line no-await-in-loop -- uma foto por vez, sem picos no bucket
      if ((await this.publisher.publish(photo)).ok) {
        published += 1;
      }
    }

    return ok({ published, remaining: await this.photos.countPublishable(albumId) });
  }
}

// Tira a foto do site: a foto continua pronta no painel, com o original e as variantes privados.
export class UnpublishPhotoUseCase {
  constructor(
    private readonly photos: PhotoRepository,
    private readonly storage: PrivateMediaStorage,
    private readonly removal: PublicPhotoRemoval,
    private readonly views: PhotoViews,
  ) {}

  async execute(photoId: string): Promise<PhotoResult> {
    if (!this.storage.enabled) {
      return err(storageDisabled);
    }

    const photo = await this.photos.findById(photoId);

    if (!photo) {
      return err(notFound);
    }

    const unpublished = photo.unpublish();

    if (!unpublished.ok) {
      return err(invalidPhotoStatus);
    }

    if ((await this.photos.update(photo)) === null) {
      return err(versionConflict);
    }

    await this.removal.removeObjects(
      photo.albumId,
      photo.id,
      unpublished.value,
      photo.variantWidths,
    );

    await this.removal.replaceCover(photo.albumId, photo.id);

    return ok(await this.views.of(photo.toSnapshot()));
  }
}

// Publicar exige ao menos uma foto publicada; sem capa definida, assume a primeira delas.
export class ChangeAlbumStatusUseCase {
  constructor(
    private readonly albums: AlbumRepository,
    private readonly photos: PhotoRepository,
    private readonly clock: Clock,
  ) {}

  async execute(id: string, action: AlbumStatusAction): Promise<AlbumResult> {
    const album = await this.albums.findById(id);

    if (!album) {
      return err(notFound);
    }

    const changed = action === 'publish' ? await this.publish(album) : album[action]();

    if (!changed.ok) {
      return err(
        changed.error === 'no_published_photos'
          ? albumWithoutPublishedPhotos
          : transitionError(changed.error),
      );
    }

    if ((await this.albums.update(album)) === null) {
      return err(versionConflict);
    }

    const view = await this.albums.findView(id);

    return view ? ok(view) : err(notFound);
  }

  private async publish(
    album: Album,
  ): Promise<Result<void, AlbumTransitionError | 'no_published_photos'>> {
    if (album.status !== 'DRAFT') {
      return album.publish(this.clock.now().toISOString(), '');
    }

    const firstPublishedId = await this.photos.findFirstPublishedId(album.id);

    if (firstPublishedId === null) {
      return err('no_published_photos');
    }

    return album.publish(this.clock.now().toISOString(), firstPublishedId);
  }
}

export class SetAlbumCoverUseCase {
  constructor(
    private readonly albums: AlbumRepository,
    private readonly photos: PhotoRepository,
  ) {}

  async execute(albumId: string, photoId: string): Promise<AlbumResult> {
    const album = await this.albums.findById(albumId);

    const photo = await this.photos.findById(photoId);

    if (!album || photo?.albumId !== albumId) {
      return err(notFound);
    }

    if (photo.publicationKey === null) {
      return err(coverNotPublished);
    }

    if (!album.setCover(photoId).ok) {
      return err(albumArchived);
    }

    if ((await this.albums.update(album)) === null) {
      return err(versionConflict);
    }

    const view = await this.albums.findView(albumId);

    return view ? ok(view) : err(notFound);
  }
}
