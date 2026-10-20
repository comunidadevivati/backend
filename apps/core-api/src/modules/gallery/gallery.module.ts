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
} from './application/ports.js';
import {
  DrizzleAlbumRepository,
  DrizzlePhotoRepository,
} from './infrastructure/drizzle-gallery.repositories.js';
import { InProcessPhotoQueue } from './infrastructure/in-process-photo.queue.js';
import { PhotoProcessingBootstrap } from './infrastructure/photo-processing.bootstrap.js';
import {
  DisabledPrivateMediaStorage,
  S3PrivateMediaStorage,
} from './infrastructure/s3-private-media.storage.js';
import { SharpImageProcessor } from './infrastructure/sharp-image.processor.js';
import { SystemClock, UuidV7IdGenerator } from './infrastructure/system.adapters.js';
import { AlbumsController } from './presentation/albums.controller.js';
import { PhotosController } from './presentation/photos.controller.js';

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

// Composition Root do contexto Gallery (ADR 0010): os Use Cases não conhecem o NestJS e são
// montados por factories.
@Module({
  controllers: [AlbumsController, PhotosController],
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
    {
      provide: DeletePhotoUseCase,
      useFactory: (photos: PhotoRepository, storage: PrivateMediaStorage) =>
        new DeletePhotoUseCase(photos, storage),
      inject: [PhotoRepository, PrivateMediaStorage],
    },
    PhotoProcessingBootstrap,
  ],
})
export class GalleryModule {}
