import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  CreateAlbumUseCase,
  GetAlbumUseCase,
  ListAlbumsUseCase,
  UpdateAlbumUseCase,
} from './application/album.use-cases.js';
import {
  CompleteUploadUseCase,
  DeletePhotoUseCase,
  ListPhotosUseCase,
  PhotoViews,
  ProcessPhotoUseCase,
  RequestUploadsUseCase,
  ResumeProcessingUseCase,
} from './application/photo.use-cases.js';
import {
  AlbumRepository,
  Clock,
  IdGenerator,
  ImageProcessor,
  PhotoProcessingQueue,
  PhotoRepository,
  PrivateMediaStorage,
  PublicGalleryReader,
  PublicMediaCache,
  PublicMediaUrls,
} from './application/ports.js';
import {
  GetPublicAlbumUseCase,
  ListPublicAlbumsUseCase,
  ListPublicPhotosUseCase,
  PublicPhotoViews,
} from './application/public-gallery.use-cases.js';
import { PublicPhotoRemoval } from './application/public-photos.js';
import {
  ChangeAlbumStatusUseCase,
  PublishAlbumPhotosUseCase,
  PublishPhotoUseCase,
  SetAlbumCoverUseCase,
  UnpublishPhotoUseCase,
} from './application/publication.use-cases.js';
import {
  CloudflarePublicMediaCache,
  NoPublicMediaCache,
} from './infrastructure/cloudflare-public-media.cache.js';
import {
  DrizzleAlbumRepository,
  DrizzlePhotoRepository,
} from './infrastructure/drizzle-gallery.repositories.js';
import { DrizzlePublicGalleryReader } from './infrastructure/drizzle-public-gallery.reader.js';
import { InProcessPhotoQueue } from './infrastructure/in-process-photo.queue.js';
import { PhotoProcessingBootstrap } from './infrastructure/photo-processing.bootstrap.js';
import { CdnPublicMediaUrls, SignedPublicMediaUrls } from './infrastructure/public-media-urls.js';
import {
  DisabledPrivateMediaStorage,
  S3PrivateMediaStorage,
} from './infrastructure/s3-private-media.storage.js';
import { SharpImageProcessor } from './infrastructure/sharp-image.processor.js';
import { SystemClock, UuidV7IdGenerator } from './infrastructure/system.adapters.js';
import { AlbumsController } from './presentation/albums.controller.js';
import { PhotosController } from './presentation/photos.controller.js';
import { PublicGalleryController } from './presentation/public-gallery.controller.js';

// Área privada do bucket de mídia conforme MEDIA_STORAGE (validado ao iniciar pelo env.schema).
const privateStorageFactory = (config: ConfigService): PrivateMediaStorage =>
  config.get<string>('MEDIA_STORAGE') === 's3'
    ? new S3PrivateMediaStorage({
        endpoint: config.getOrThrow<string>('MEDIA_S3_ENDPOINT'),
        region: config.getOrThrow<string>('MEDIA_S3_REGION'),
        accessKeyId: config.getOrThrow<string>('MEDIA_S3_ACCESS_KEY_ID'),
        secretAccessKey: config.getOrThrow<string>('MEDIA_S3_SECRET_ACCESS_KEY'),
        bucket: config.getOrThrow<string>('MEDIA_BUCKET'),
        keyPrefix: config.getOrThrow<string>('MEDIA_KEY_PREFIX'),
      })
    : new DisabledPrivateMediaStorage();

// Purge da CDN somente com o domínio público configurado (as três variáveis vêm juntas).
const publicCacheFactory = (config: ConfigService): PublicMediaCache => {
  const publicBaseUrl = config.get<string>('MEDIA_PUBLIC_BASE_URL');

  const keyPrefix = config.get<string>('MEDIA_KEY_PREFIX');

  return publicBaseUrl && keyPrefix && config.get<string>('MEDIA_STORAGE') === 's3'
    ? new CloudflarePublicMediaCache({
        publicBaseUrl,
        keyPrefix,
        zoneId: config.getOrThrow<string>('MEDIA_CDN_ZONE_ID'),
        apiToken: config.getOrThrow<string>('MEDIA_CDN_PURGE_TOKEN'),
      })
    : new NoPublicMediaCache();
};

// URLs do site: domínio público quando configurado; senão, URLs assinadas de validade curta.
const publicUrlsFactory = (
  config: ConfigService,
  storage: PrivateMediaStorage,
): PublicMediaUrls => {
  const publicBaseUrl = config.get<string>('MEDIA_PUBLIC_BASE_URL');

  const keyPrefix = config.get<string>('MEDIA_KEY_PREFIX');

  return publicBaseUrl && keyPrefix
    ? new CdnPublicMediaUrls(publicBaseUrl, keyPrefix)
    : new SignedPublicMediaUrls(storage);
};

// Composition Root do contexto Gallery (ADR 0010): os Use Cases não conhecem o NestJS e são
// montados por factories.
@Module({
  controllers: [AlbumsController, PhotosController, PublicGalleryController],
  providers: [
    { provide: AlbumRepository, useClass: DrizzleAlbumRepository },
    { provide: PhotoRepository, useClass: DrizzlePhotoRepository },
    { provide: PrivateMediaStorage, useFactory: privateStorageFactory, inject: [ConfigService] },
    { provide: ImageProcessor, useClass: SharpImageProcessor },
    InProcessPhotoQueue,
    { provide: PhotoProcessingQueue, useExisting: InProcessPhotoQueue },
    { provide: IdGenerator, useClass: UuidV7IdGenerator },
    { provide: Clock, useClass: SystemClock },
    {
      provide: PhotoViews,
      useFactory: (storage: PrivateMediaStorage) => new PhotoViews(storage),
      inject: [PrivateMediaStorage],
    },
    {
      provide: ListAlbumsUseCase,
      useFactory: (albums: AlbumRepository) => new ListAlbumsUseCase(albums),
      inject: [AlbumRepository],
    },
    {
      provide: GetAlbumUseCase,
      useFactory: (albums: AlbumRepository) => new GetAlbumUseCase(albums),
      inject: [AlbumRepository],
    },
    {
      provide: CreateAlbumUseCase,
      useFactory: (albums: AlbumRepository, ids: IdGenerator, clock: Clock) =>
        new CreateAlbumUseCase(albums, ids, clock),
      inject: [AlbumRepository, IdGenerator, Clock],
    },
    {
      provide: UpdateAlbumUseCase,
      useFactory: (albums: AlbumRepository, clock: Clock) => new UpdateAlbumUseCase(albums, clock),
      inject: [AlbumRepository, Clock],
    },
    {
      provide: ListPhotosUseCase,
      useFactory: (albums: AlbumRepository, photos: PhotoRepository, views: PhotoViews) =>
        new ListPhotosUseCase(albums, photos, views),
      inject: [AlbumRepository, PhotoRepository, PhotoViews],
    },
    {
      provide: RequestUploadsUseCase,
      useFactory: (
        albums: AlbumRepository,
        photos: PhotoRepository,
        storage: PrivateMediaStorage,
        ids: IdGenerator,
        clock: Clock,
      ) => new RequestUploadsUseCase(albums, photos, storage, ids, clock),
      inject: [AlbumRepository, PhotoRepository, PrivateMediaStorage, IdGenerator, Clock],
    },
    {
      provide: CompleteUploadUseCase,
      useFactory: (
        photos: PhotoRepository,
        storage: PrivateMediaStorage,
        queue: PhotoProcessingQueue,
        views: PhotoViews,
      ) => new CompleteUploadUseCase(photos, storage, queue, views),
      inject: [PhotoRepository, PrivateMediaStorage, PhotoProcessingQueue, PhotoViews],
    },
    {
      provide: ProcessPhotoUseCase,
      useFactory: (
        photos: PhotoRepository,
        storage: PrivateMediaStorage,
        processor: ImageProcessor,
      ) => new ProcessPhotoUseCase(photos, storage, processor),
      inject: [PhotoRepository, PrivateMediaStorage, ImageProcessor],
    },
    {
      provide: ResumeProcessingUseCase,
      useFactory: (photos: PhotoRepository, queue: PhotoProcessingQueue) =>
        new ResumeProcessingUseCase(photos, queue),
      inject: [PhotoRepository, PhotoProcessingQueue],
    },
    { provide: PublicMediaCache, useFactory: publicCacheFactory, inject: [ConfigService] },
    {
      provide: PublicPhotoRemoval,
      useFactory: (
        albums: AlbumRepository,
        photos: PhotoRepository,
        storage: PrivateMediaStorage,
        cache: PublicMediaCache,
      ) => new PublicPhotoRemoval(albums, photos, storage, cache),
      inject: [AlbumRepository, PhotoRepository, PrivateMediaStorage, PublicMediaCache],
    },
    {
      provide: DeletePhotoUseCase,
      useFactory: (
        photos: PhotoRepository,
        storage: PrivateMediaStorage,
        removal: PublicPhotoRemoval,
      ) => new DeletePhotoUseCase(photos, storage, removal),
      inject: [PhotoRepository, PrivateMediaStorage, PublicPhotoRemoval],
    },
    {
      provide: PublishPhotoUseCase,
      useFactory: (
        albums: AlbumRepository,
        photos: PhotoRepository,
        storage: PrivateMediaStorage,
        ids: IdGenerator,
        clock: Clock,
        views: PhotoViews,
      ) => new PublishPhotoUseCase(albums, photos, storage, ids, clock, views),
      inject: [
        AlbumRepository,
        PhotoRepository,
        PrivateMediaStorage,
        IdGenerator,
        Clock,
        PhotoViews,
      ],
    },
    {
      provide: PublishAlbumPhotosUseCase,
      useFactory: (
        albums: AlbumRepository,
        photos: PhotoRepository,
        storage: PrivateMediaStorage,
        ids: IdGenerator,
        clock: Clock,
      ) => new PublishAlbumPhotosUseCase(albums, photos, storage, ids, clock),
      inject: [AlbumRepository, PhotoRepository, PrivateMediaStorage, IdGenerator, Clock],
    },
    {
      provide: UnpublishPhotoUseCase,
      useFactory: (
        photos: PhotoRepository,
        storage: PrivateMediaStorage,
        removal: PublicPhotoRemoval,
        views: PhotoViews,
      ) => new UnpublishPhotoUseCase(photos, storage, removal, views),
      inject: [PhotoRepository, PrivateMediaStorage, PublicPhotoRemoval, PhotoViews],
    },
    {
      provide: ChangeAlbumStatusUseCase,
      useFactory: (albums: AlbumRepository, photos: PhotoRepository, clock: Clock) =>
        new ChangeAlbumStatusUseCase(albums, photos, clock),
      inject: [AlbumRepository, PhotoRepository, Clock],
    },
    {
      provide: SetAlbumCoverUseCase,
      useFactory: (albums: AlbumRepository, photos: PhotoRepository) =>
        new SetAlbumCoverUseCase(albums, photos),
      inject: [AlbumRepository, PhotoRepository],
    },
    { provide: PublicGalleryReader, useClass: DrizzlePublicGalleryReader },
    {
      provide: PublicMediaUrls,
      useFactory: publicUrlsFactory,
      inject: [ConfigService, PrivateMediaStorage],
    },
    {
      provide: PublicPhotoViews,
      useFactory: (urls: PublicMediaUrls) => new PublicPhotoViews(urls),
      inject: [PublicMediaUrls],
    },
    {
      provide: ListPublicAlbumsUseCase,
      useFactory: (reader: PublicGalleryReader, views: PublicPhotoViews) =>
        new ListPublicAlbumsUseCase(reader, views),
      inject: [PublicGalleryReader, PublicPhotoViews],
    },
    {
      provide: GetPublicAlbumUseCase,
      useFactory: (reader: PublicGalleryReader, views: PublicPhotoViews) =>
        new GetPublicAlbumUseCase(reader, views),
      inject: [PublicGalleryReader, PublicPhotoViews],
    },
    {
      provide: ListPublicPhotosUseCase,
      useFactory: (reader: PublicGalleryReader, views: PublicPhotoViews) =>
        new ListPublicPhotosUseCase(reader, views),
      inject: [PublicGalleryReader, PublicPhotoViews],
    },
    PhotoProcessingBootstrap,
  ],
})
export class GalleryModule {}
