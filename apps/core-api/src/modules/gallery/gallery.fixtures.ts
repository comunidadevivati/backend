// Dados e dublês compartilhados pelos testes unitários do contexto Gallery.
import {
  AlbumRepository,
  Clock,
  IdGenerator,
  ImageProcessor,
  PhotoProcessingQueue,
  PhotoRepository,
  PrivateMediaStorage,
  type AlbumListQuery,
  type AlbumView,
  type PhotoListQuery,
  type ProcessedImage,
} from './application/ports.js';
import { Album, type AlbumSnapshot } from './domain/album.js';
import { Photo, type PhotoSnapshot, type PhotoStatus } from './domain/photo.js';

export const TODAY = '2026-10-20';

export const NOW = new Date('2026-10-20T15:00:00Z');

export const ALBUM_ID = '01a14f8e-a000-7000-8000-0000000000a1';

export const PHOTO_ID = '01a14f8e-b000-7000-8000-0000000000b1';

export const albumSnapshot = (overrides: Partial<AlbumSnapshot> = {}): AlbumSnapshot => ({
  id: ALBUM_ID,
  slug: '2026-10-19-culto-de-domingo',
  title: 'Culto de Domingo',
  description: null,
  occurredOn: '2026-10-19',
  coverPhotoId: null,
  status: 'DRAFT',
  publishedAt: null,
  version: 1,
  ...overrides,
});

export const photoSnapshot = (overrides: Partial<PhotoSnapshot> = {}): PhotoSnapshot => ({
  id: PHOTO_ID,
  albumId: ALBUM_ID,
  status: 'READY',
  contentType: 'image/jpeg',
  byteSize: 2_000_000,
  width: 1200,
  height: 800,
  placeholder: 'data:image/webp;base64,AAAA',
  variantWidths: [320, 640, 1024],
  failure: null,
  version: 1,
  ...overrides,
});

// Repositórios em memória com as mesmas regras de versão e de unicidade dos adaptadores Drizzle.
export class InMemoryAlbumRepository extends AlbumRepository {
  readonly stored = new Map<string, AlbumSnapshot>();

  lastQuery: AlbumListQuery | null = null;

  failNextUpdate = false;

  constructor(
    snapshots: AlbumSnapshot[] = [albumSnapshot()],
    private readonly photos?: InMemoryPhotoRepository,
  ) {
    super();

    for (const snapshot of snapshots) {
      this.stored.set(snapshot.id, snapshot);
    }
  }

  findById(id: string): Promise<Album | null> {
    const snapshot = this.stored.get(id);

    return Promise.resolve(snapshot ? Album.restore(snapshot) : null);
  }

  findView(id: string): Promise<AlbumView | null> {
    const snapshot = this.stored.get(id);

    return Promise.resolve(snapshot ? this.view(snapshot) : null);
  }

  list(query: AlbumListQuery): Promise<AlbumView[]> {
    this.lastQuery = query;

    const { after, limit, status } = query;

    const ordered = [...this.stored.values()]
      .filter((album) => status === null || album.status === status)
      .toSorted(
        (left, right) =>
          right.occurredOn.localeCompare(left.occurredOn) || right.id.localeCompare(left.id),
      );

    const start = after ? ordered.findIndex(({ id }) => id === after) + 1 : 0;

    return Promise.resolve(
      ordered.slice(start, start + limit).map((snapshot) => this.view(snapshot)),
    );
  }

  insert(album: Album): Promise<'inserted' | 'slug_taken'> {
    const snapshot = album.toSnapshot();

    if ([...this.stored.values()].some(({ slug }) => slug === snapshot.slug)) {
      return Promise.resolve('slug_taken');
    }

    this.stored.set(snapshot.id, snapshot);

    return Promise.resolve('inserted');
  }

  update(album: Album): Promise<number | null> {
    const current = this.stored.get(album.id);

    if (this.failNextUpdate || album.version !== current?.version) {
      this.failNextUpdate = false;

      return Promise.resolve(null);
    }

    const version = album.version + 1;

    this.stored.set(album.id, { ...album.toSnapshot(), version });

    return Promise.resolve(version);
  }

  private view(snapshot: AlbumSnapshot): AlbumView {
    const photoCount = [...(this.photos?.stored.values() ?? [])].filter(
      ({ albumId, status }) => albumId === snapshot.id && status === 'READY',
    ).length;

    return { ...snapshot, photoCount };
  }
}

export class InMemoryPhotoRepository extends PhotoRepository {
  readonly stored = new Map<string, PhotoSnapshot>();

  // Momento de criação de cada foto, para o descarte de envios abandonados.
  readonly createdAt = new Map<string, Date>();

  failNextUpdate = false;

  constructor(snapshots: PhotoSnapshot[] = []) {
    super();

    for (const snapshot of snapshots) {
      this.stored.set(snapshot.id, snapshot);

      this.createdAt.set(snapshot.id, NOW);
    }
  }

  findById(id: string): Promise<Photo | null> {
    const snapshot = this.stored.get(id);

    return Promise.resolve(snapshot ? Photo.restore(snapshot) : null);
  }

  listByAlbum({ after, albumId, limit }: PhotoListQuery): Promise<PhotoSnapshot[]> {
    return Promise.resolve(
      [...this.stored.values()]
        .filter((photo) => photo.albumId === albumId && photo.status !== 'PENDING_UPLOAD')
        .filter(({ id }) => after === null || id > after)
        .toSorted((left, right) => left.id.localeCompare(right.id))
        .slice(0, limit),
    );
  }

  countByAlbum(albumId: string): Promise<number> {
    return Promise.resolve(
      [...this.stored.values()].filter((photo) => photo.albumId === albumId).length,
    );
  }

  listByStatus(status: PhotoStatus): Promise<PhotoSnapshot[]> {
    return Promise.resolve([...this.stored.values()].filter((photo) => photo.status === status));
  }

  insertMany(photos: readonly Photo[]): Promise<void> {
    for (const photo of photos) {
      this.stored.set(photo.id, photo.toSnapshot());

      this.createdAt.set(photo.id, NOW);
    }

    return Promise.resolve();
  }

  update(photo: Photo): Promise<number | null> {
    const current = this.stored.get(photo.id);

    if (this.failNextUpdate || photo.version !== current?.version) {
      this.failNextUpdate = false;

      return Promise.resolve(null);
    }

    const version = photo.version + 1;

    this.stored.set(photo.id, { ...photo.toSnapshot(), version });

    return Promise.resolve(version);
  }

  delete(id: string): Promise<void> {
    this.stored.delete(id);

    return Promise.resolve();
  }

  deletePendingCreatedBefore(albumId: string, before: Date): Promise<void> {
    for (const [id, photo] of this.stored) {
      const createdAt = this.createdAt.get(id) ?? NOW;

      if (photo.albumId === albumId && photo.status === 'PENDING_UPLOAD' && createdAt < before) {
        this.stored.delete(id);
      }
    }

    return Promise.resolve();
  }
}

// Bucket em memória; as URLs pré-assinadas são fictícias e determinísticas.
export class InMemoryMediaStorage extends PrivateMediaStorage {
  readonly objects = new Map<string, { body: Uint8Array; contentType: string }>();

  // Simula falha do armazenamento na próxima gravação.
  failNextWrite = false;

  constructor(readonly enabled = true) {
    super();
  }

  presignUpload(key: string, contentType: string, expiresInSeconds: number): Promise<string> {
    return Promise.resolve(
      `https://s3.test/put/${key}?type=${contentType}&ttl=${expiresInSeconds}`,
    );
  }

  presignDownload(key: string, expiresInSeconds: number): Promise<string> {
    return Promise.resolve(`https://s3.test/get/${key}?ttl=${expiresInSeconds}`);
  }

  size(key: string): Promise<number | null> {
    return Promise.resolve(this.objects.get(key)?.body.byteLength ?? null);
  }

  read(key: string): Promise<Uint8Array | null> {
    return Promise.resolve(this.objects.get(key)?.body ?? null);
  }

  write(key: string, body: Uint8Array, contentType: string): Promise<void> {
    if (this.failNextWrite) {
      this.failNextWrite = false;

      return Promise.reject(new Error('falha de gravação'));
    }

    this.objects.set(key, { body, contentType });

    return Promise.resolve();
  }

  delete(keys: readonly string[]): Promise<void> {
    for (const key of keys) {
      this.objects.delete(key);
    }

    return Promise.resolve();
  }

  put(key: string, size: number): void {
    this.objects.set(key, { body: new Uint8Array(size), contentType: 'image/jpeg' });
  }
}

export const processedImage = (widths: number[] = [320, 640]): ProcessedImage => ({
  width: 800,
  height: 600,
  placeholder: 'data:image/webp;base64,BBBB',
  original: new Uint8Array([1, 2, 3]),
  variants: widths.flatMap((width) => [
    { width, format: 'avif' as const, body: new Uint8Array([width]) },
    { width, format: 'webp' as const, body: new Uint8Array([width]) },
  ]),
});

export class StubImageProcessor extends ImageProcessor {
  result: ProcessedImage | null | Error = processedImage();

  process(): Promise<ProcessedImage | null> {
    return this.result instanceof Error
      ? Promise.reject(this.result)
      : Promise.resolve(this.result);
  }
}

export class RecordingQueue extends PhotoProcessingQueue {
  readonly enqueued: string[] = [];

  enqueue(photoId: string): void {
    this.enqueued.push(photoId);
  }
}

export class SequentialIdGenerator extends IdGenerator {
  private counter = 0;

  next(): string {
    this.counter += 1;

    return `01a14f8e-c000-7000-8000-${String(this.counter).padStart(12, '0')}`;
  }
}

export class FixedClock extends Clock {
  today(): string {
    return TODAY;
  }

  now(): Date {
    return NOW;
  }
}
