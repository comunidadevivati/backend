import { describe, expect, it } from 'vitest';
import {
  CreateAlbumUseCase,
  GetAlbumUseCase,
  ListAlbumsUseCase,
  UpdateAlbumUseCase,
} from '../application/album.use-cases.js';
import { uploadKey } from '../application/media-keys.js';
import {
  CompleteUploadUseCase,
  DeletePhotoUseCase,
  ListPhotosUseCase,
  PhotoViews,
  RequestUploadsUseCase,
} from '../application/photo.use-cases.js';
import {
  ALBUM_ID,
  FixedClock,
  InMemoryAlbumRepository,
  InMemoryMediaStorage,
  InMemoryPhotoRepository,
  RecordingQueue,
  SequentialIdGenerator,
} from '../gallery.fixtures.js';
import { AlbumsController } from './albums.controller.js';
import { PhotosController } from './photos.controller.js';

const createControllers = ({ enabled = true } = {}) => {
  const photos = new InMemoryPhotoRepository();

  const albums = new InMemoryAlbumRepository(undefined, photos);

  const storage = new InMemoryMediaStorage(enabled);

  const ids = new SequentialIdGenerator();

  const clock = new FixedClock();

  const views = new PhotoViews(storage);

  return {
    storage,
    albums: new AlbumsController(
      new ListAlbumsUseCase(albums),
      new GetAlbumUseCase(albums),
      new CreateAlbumUseCase(albums, ids, clock),
      new UpdateAlbumUseCase(albums, clock),
      new ListPhotosUseCase(albums, photos, views),
      new RequestUploadsUseCase(albums, photos, storage, ids, clock),
    ),
    photos: new PhotosController(
      new CompleteUploadUseCase(photos, storage, new RecordingQueue(), views),
      new DeletePhotoUseCase(photos, storage),
    ),
  };
};

const problemOf = async (promise: Promise<unknown>) => {
  const error: unknown = await promise.catch((caught: unknown) => caught);

  return (error as { getResponse: () => unknown }).getResponse();
};

describe('AlbumsController e PhotosController', () => {
  it('deve criar, listar, consultar e alterar álbuns', async () => {
    const { albums } = createControllers();

    const created = await albums.create({ title: 'Batismo', occurredOn: '2026-10-18' });

    expect(created).toMatchObject({
      slug: '2026-10-18-batismo',
      status: 'DRAFT',
      description: null,
    });

    await expect(albums.list({ limit: '1' })).resolves.toMatchObject({
      items: [{ id: ALBUM_ID }],
      nextCursor: ALBUM_ID,
    });

    await expect(albums.get(created.id)).resolves.toMatchObject({ title: 'Batismo' });

    await expect(
      albums.update(created.id, { version: 1, description: 'Domingo à tarde' }),
    ).resolves.toMatchObject({ description: 'Domingo à tarde', version: 2 });
  });

  it('deve pedir envios, confirmar, listar e excluir fotos', async () => {
    const { albums, photos, storage } = createControllers();

    const { items } = await albums.uploads(ALBUM_ID, {
      files: [{ contentType: 'image/webp', byteSize: 500 }],
    });

    const [ticket] = items;

    expect(ticket).toMatchObject({ contentType: 'image/webp' });

    storage.put(uploadKey(ticket?.photoId ?? ''), 500);

    await expect(photos.complete(ticket?.photoId ?? '')).resolves.toMatchObject({
      status: 'PROCESSING',
    });

    await expect(albums.photos(ALBUM_ID, {})).resolves.toMatchObject({
      items: [{ id: ticket?.photoId }],
      nextCursor: null,
    });

    await expect(photos.delete(ticket?.photoId ?? '')).resolves.toBeUndefined();
  });

  it('deve recusar entradas inválidas no transporte, listando os campos', async () => {
    const { albums } = createControllers();

    await expect(problemOf(albums.create({ title: 1, extra: true }))).resolves.toMatchObject({
      status: 400,
      fields: ['title', 'occurredOn', 'body'],
    });

    await expect(problemOf(albums.list({ status: 'X', limit: '0' }))).resolves.toMatchObject({
      status: 400,
      fields: ['status', 'limit'],
    });

    await expect(
      problemOf(albums.uploads(ALBUM_ID, { files: Array.from({ length: 51 }, () => ({})) })),
    ).resolves.toMatchObject({ status: 400 });

    await expect(problemOf(albums.photos(ALBUM_ID, { limit: '101' }))).resolves.toMatchObject({
      status: 400,
      fields: ['limit'],
    });
  });

  it('deve mapear os erros esperados para Problem Details', async () => {
    const { albums, photos } = createControllers();

    await expect(problemOf(albums.get('nao-e-uuid'))).resolves.toMatchObject({ status: 404 });

    await expect(problemOf(photos.delete(ALBUM_ID))).resolves.toMatchObject({ status: 404 });

    await expect(
      problemOf(albums.update(ALBUM_ID, { version: 9, title: 'Outro' })),
    ).resolves.toMatchObject({ status: 409 });

    await expect(
      problemOf(albums.create({ title: 'Batismo', occurredOn: '2099-01-01' })),
    ).resolves.toMatchObject({ status: 400, fields: ['occurredOn'] });

    const disabled = createControllers({ enabled: false });

    await expect(
      problemOf(
        disabled.albums.uploads(ALBUM_ID, { files: [{ contentType: 'image/jpeg', byteSize: 1 }] }),
      ),
    ).resolves.toMatchObject({ status: 503, title: 'Serviço indisponível' });
  });
});
