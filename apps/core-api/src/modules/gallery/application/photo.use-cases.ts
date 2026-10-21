import { err, ok, type Result } from '../../../shared/domain/result.js';
import {
  MAX_PHOTO_BYTES,
  MAX_PHOTOS_PER_ALBUM,
  Photo,
  isAcceptedPhotoType,
  type PhotoFailure,
  type PhotoSnapshot,
} from '../domain/photo.js';
import {
  albumArchived,
  albumFull,
  invalidFields,
  invalidPhotoStatus,
  notFound,
  storageDisabled,
  uploadMissing,
  uploadTooLarge,
  versionConflict,
  type GalleryError,
} from './gallery-errors.js';
import { originalKey, privateKeysOf, uploadKey, variantKey } from './media-keys.js';
import type {
  AlbumRepository,
  Clock,
  IdGenerator,
  ImageProcessor,
  PhotoProcessingQueue,
  PhotoRepository,
  PrivateMediaStorage,
} from './ports.js';
import type { PublicPhotoRemoval } from './public-photos.js';

// Validade das URLs de envio e das miniaturas do painel.
const UPLOAD_URL_TTL_SECONDS = 15 * 60;

const PREVIEW_URL_TTL_SECONDS = 60 * 60;

// Pedidos de envio sem confirmação depois deste prazo são descartados.
const PENDING_UPLOAD_TTL_MS = 24 * 60 * 60 * 1000;

// Miniatura do painel: a maior variante até esta largura.
const PREVIEW_WIDTH = 640;

interface UploadFileInput {
  contentType: string;
  byteSize: number;
}

export interface RequestUploadsCommand {
  albumId: string;
  files: readonly UploadFileInput[];
}

// O navegador envia o arquivo com PUT na uploadUrl, com exatamente este Content-Type.
export interface UploadTicket {
  photoId: string;
  uploadUrl: string;
  contentType: string;
  expiresAt: string;
}

// Foto como exposta no painel: previewUrl é uma URL de leitura de validade curta.
export interface PhotoView {
  id: string;
  albumId: string;
  status: PhotoSnapshot['status'];
  width: number | null;
  height: number | null;
  placeholder: string | null;
  failure: PhotoFailure | null;
  previewUrl: string | null;
  // Publicada no site (variantes na área pública); null quando não publicada.
  publishedAt: string | null;
  version: number;
}

export interface ListPhotosQuery {
  albumId: string;
  cursor: string | null;
  limit: number;
}

export interface PhotoPage {
  items: PhotoView[];
  nextCursor: string | null;
}

type PhotoResult = Result<PhotoView, GalleryError>;

const previewWidthOf = (variantWidths: readonly number[]): number | undefined =>
  variantWidths.findLast((width) => width <= PREVIEW_WIDTH) ?? variantWidths[0];

// Monta a visão do painel, assinando a miniatura das fotos prontas.
export class PhotoViews {
  constructor(private readonly storage: PrivateMediaStorage) {}

  async of(snapshot: PhotoSnapshot): Promise<PhotoView> {
    const {
      albumId,
      failure,
      height,
      id,
      placeholder,
      publishedAt,
      status,
      variantWidths,
      version,
      width,
    } = snapshot;

    const previewWidth = previewWidthOf(variantWidths);

    const previewUrl =
      status === 'READY' && this.storage.enabled && previewWidth !== undefined
        ? await this.storage.presignDownload(
            variantKey(albumId, id, previewWidth, 'webp'),
            PREVIEW_URL_TTL_SECONDS,
          )
        : null;

    return {
      id,
      albumId,
      status,
      width,
      height,
      placeholder,
      failure,
      previewUrl,
      publishedAt,
      version,
    };
  }
}

export class RequestUploadsUseCase {
  constructor(
    private readonly albums: AlbumRepository,
    private readonly photos: PhotoRepository,
    private readonly storage: PrivateMediaStorage,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
  ) {}

  // Cria as fotos PENDING_UPLOAD e devolve uma URL de envio para cada arquivo, na mesma ordem.
  async execute({
    albumId,
    files,
  }: RequestUploadsCommand): Promise<Result<UploadTicket[], GalleryError>> {
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

    const invalid = files.flatMap(({ byteSize, contentType }, index) => [
      ...(isAcceptedPhotoType(contentType) ? [] : [`files.${index}.contentType`]),
      ...(byteSize > 0 && byteSize <= MAX_PHOTO_BYTES ? [] : [`files.${index}.byteSize`]),
    ]);

    if (invalid.length > 0) {
      return err(invalidFields(invalid));
    }

    const now = this.clock.now();

    await this.photos.deletePendingCreatedBefore(
      albumId,
      new Date(now.getTime() - PENDING_UPLOAD_TTL_MS),
    );

    if ((await this.photos.countByAlbum(albumId)) + files.length > MAX_PHOTOS_PER_ALBUM) {
      return err(albumFull);
    }

    const photos = files.flatMap(({ byteSize, contentType }) =>
      isAcceptedPhotoType(contentType)
        ? [Photo.request(this.ids.next(), albumId, contentType, byteSize)]
        : [],
    );

    await this.photos.insertMany(photos);

    const expiresAt = new Date(now.getTime() + UPLOAD_URL_TTL_SECONDS * 1000).toISOString();

    return ok(
      await Promise.all(
        photos.map(async (photo) => {
          const { contentType, id } = photo.toSnapshot();

          return {
            photoId: id,
            uploadUrl: await this.storage.presignUpload(
              uploadKey(id),
              contentType,
              UPLOAD_URL_TTL_SECONDS,
            ),
            contentType,
            expiresAt,
          };
        }),
      ),
    );
  }
}

// O navegador avisa que o PUT terminou. O objeto é conferido e a foto vai para a fila.
export class CompleteUploadUseCase {
  constructor(
    private readonly photos: PhotoRepository,
    private readonly storage: PrivateMediaStorage,
    private readonly queue: PhotoProcessingQueue,
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

    // Confirmação repetida (ex.: nova tentativa do navegador) não processa de novo.
    if (photo.status === 'PROCESSING' || photo.status === 'READY') {
      return ok(await this.views.of(photo.toSnapshot()));
    }

    if (photo.status !== 'PENDING_UPLOAD') {
      return err(invalidPhotoStatus);
    }

    const size = await this.storage.size(uploadKey(photoId));

    if (size === null) {
      return err(uploadMissing);
    }

    // A URL pré-assinada não limita o tamanho: o excesso é descartado aqui.
    if (size > MAX_PHOTO_BYTES) {
      await this.storage.delete([uploadKey(photoId)]);

      return err(uploadTooLarge);
    }

    if (!photo.markUploaded(size).ok) {
      return err(invalidPhotoStatus);
    }

    const version = await this.photos.update(photo);

    if (version === null) {
      return err(versionConflict);
    }

    this.queue.enqueue(photoId);

    return ok(await this.views.of({ ...photo.toSnapshot(), version }));
  }
}

// Executado pela fila, fora da requisição: valida o conteúdo, gera o original reduzido e as
// variantes na área privada do bucket e marca a foto READY (ou FAILED).
export class ProcessPhotoUseCase {
  constructor(
    private readonly photos: PhotoRepository,
    private readonly storage: PrivateMediaStorage,
    private readonly processor: ImageProcessor,
  ) {}

  async execute(photoId: string): Promise<void> {
    const photo = await this.photos.findById(photoId);

    if (photo?.status !== 'PROCESSING') {
      return;
    }

    const { albumId } = photo;

    let written: string[] = [];

    let failed = false;

    try {
      const input = await this.storage.read(uploadKey(photoId));

      const image = input ? await this.processor.process(input) : null;

      if (image) {
        written = [
          originalKey(albumId, photoId),
          ...image.variants.map(({ format, width }) => variantKey(albumId, photoId, width, format)),
        ];

        await this.storage.write(originalKey(albumId, photoId), image.original, 'image/jpeg');

        for (const { body, format, width } of image.variants) {
          // oxlint-disable-next-line no-await-in-loop -- gravação sequencial, sem picos de memória
          await this.storage.write(
            variantKey(albumId, photoId, width, format),
            body,
            `image/${format}`,
          );
        }

        photo.markReady({
          width: image.width,
          height: image.height,
          placeholder: image.placeholder,
          variantWidths: [...new Set(image.variants.map(({ width }) => width))],
        });
      } else {
        failed = true;

        photo.markFailed(input ? 'invalid_image' : 'processing_error');
      }
    } catch {
      failed = true;

      photo.markFailed('processing_error');
    }

    // Falha no meio das gravações ou foto excluída durante o processamento: não deixa objetos
    // órfãos no bucket.
    const saved = (await this.photos.update(photo)) !== null;

    if (!saved || failed) {
      await this.storage.delete(written);
    }

    await this.storage.delete([uploadKey(photoId)]);
  }
}

// Ao iniciar a Core API, retoma as fotos que estavam na fila quando a instância parou.
export class ResumeProcessingUseCase {
  constructor(
    private readonly photos: PhotoRepository,
    private readonly queue: PhotoProcessingQueue,
  ) {}

  async execute(): Promise<number> {
    const pending = await this.photos.listByStatus('PROCESSING');

    for (const { id } of pending) {
      this.queue.enqueue(id);
    }

    return pending.length;
  }
}

export class ListPhotosUseCase {
  constructor(
    private readonly albums: AlbumRepository,
    private readonly photos: PhotoRepository,
    private readonly views: PhotoViews,
  ) {}

  async execute({
    albumId,
    cursor,
    limit,
  }: ListPhotosQuery): Promise<Result<PhotoPage, GalleryError>> {
    if (!(await this.albums.findById(albumId))) {
      return err(notFound);
    }

    const rows = await this.photos.listByAlbum({ albumId, after: cursor, limit: limit + 1 });

    const page = rows.slice(0, limit);

    return ok({
      items: await Promise.all(page.map((row) => this.views.of(row))),
      nextCursor: rows.length > limit ? (page.at(-1)?.id ?? null) : null,
    });
  }
}

// Exclusão definitiva: tira a foto do site (se publicada), apaga os objetos privados e os metadados.
export class DeletePhotoUseCase {
  constructor(
    private readonly photos: PhotoRepository,
    private readonly storage: PrivateMediaStorage,
    private readonly removal: PublicPhotoRemoval,
  ) {}

  async execute(photoId: string): Promise<Result<void, GalleryError>> {
    const photo = await this.photos.findById(photoId);

    if (!photo) {
      return err(notFound);
    }

    const { albumId, publicationKey, variantWidths } = photo;

    if (this.storage.enabled) {
      if (publicationKey !== null) {
        await this.removal.removeObjects(albumId, photoId, publicationKey, variantWidths);
      }

      await this.storage.delete(privateKeysOf(albumId, photoId, variantWidths));
    }

    await this.photos.delete(photoId);

    if (publicationKey !== null) {
      await this.removal.replaceCover(albumId, photoId);
    }

    return ok();
  }
}
