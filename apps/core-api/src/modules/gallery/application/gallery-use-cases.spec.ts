import { describe, expect, it } from 'vitest';
import {
  ALBUM_ID,
  FixedClock,
  InMemoryAlbumRepository,
  InMemoryMediaStorage,
  InMemoryPhotoRepository,
  NOW,
  PHOTO_ID,
  RecordingPublicMediaCache,
  RecordingQueue,
  SequentialIdGenerator,
  StubImageProcessor,
  albumSnapshot,
  photoSnapshot,
  processedImage,
} from '../gallery.fixtures.js';
import {
  CreateAlbumUseCase,
  GetAlbumUseCase,
  ListAlbumsUseCase,
  UpdateAlbumUseCase,
} from './album.use-cases.js';
import { originalKey, uploadKey, variantKey } from './media-keys.js';
import {
  CompleteUploadUseCase,
  DeletePhotoUseCase,
  ListPhotosUseCase,
  PhotoViews,
  ProcessPhotoUseCase,
  RequestUploadsUseCase,
  ResumeProcessingUseCase,
} from './photo.use-cases.js';
import { PublicPhotoRemoval } from './public-photos.js';
import type { AlbumSnapshot } from '../domain/album.js';
import type { PhotoSnapshot } from '../domain/photo.js';

const UNKNOWN_ID = '01a14f8e-ffff-7000-8000-000000000000';

const SECOND_ALBUM_ID = '01a14f8e-a000-7000-8000-0000000000a2';

const setup = (
  albums: AlbumSnapshot[] = [albumSnapshot()],
  photos: PhotoSnapshot[] = [],
  { enabled = true } = {},
) => {
  const photoRepository = new InMemoryPhotoRepository(photos);

  const albumRepository = new InMemoryAlbumRepository(albums, photoRepository);

  const storage = new InMemoryMediaStorage(enabled);

  const queue = new RecordingQueue();

  const processor = new StubImageProcessor();

  const clock = new FixedClock();

  const ids = new SequentialIdGenerator();

  const views = new PhotoViews(storage);

  return {
    albumRepository,
    photoRepository,
    processor,
    queue,
    storage,
    listAlbums: new ListAlbumsUseCase(albumRepository),
    getAlbum: new GetAlbumUseCase(albumRepository),
    createAlbum: new CreateAlbumUseCase(albumRepository, ids, clock),
    updateAlbum: new UpdateAlbumUseCase(albumRepository, clock),
    requestUploads: new RequestUploadsUseCase(
      albumRepository,
      photoRepository,
      storage,
      ids,
      clock,
    ),
    completeUpload: new CompleteUploadUseCase(photoRepository, storage, queue, views),
    processPhoto: new ProcessPhotoUseCase(photoRepository, storage, processor),
    resume: new ResumeProcessingUseCase(photoRepository, queue),
    listPhotos: new ListPhotosUseCase(albumRepository, photoRepository, views),
    deletePhoto: new DeletePhotoUseCase(
      photoRepository,
      storage,
      new PublicPhotoRemoval(
        albumRepository,
        photoRepository,
        storage,
        new RecordingPublicMediaCache(),
      ),
    ),
  };
};

const jpeg = (byteSize = 1000) => ({ contentType: 'image/jpeg', byteSize });

describe('Álbuns', () => {
  it('deve criar o álbum DRAFT com slug livre, somando sufixo quando repetido', async () => {
    const { createAlbum } = setup();

    const input = { title: '  Culto de   Domingo ', description: ' ', occurredOn: '2026-10-19' };

    await expect(createAlbum.execute(input)).resolves.toMatchObject({
      ok: true,
      value: {
        slug: '2026-10-19-culto-de-domingo-2',
        title: 'Culto de Domingo',
        description: null,
        status: 'DRAFT',
        photoCount: 0,
      },
    });

    await expect(createAlbum.execute(input)).resolves.toMatchObject({
      ok: true,
      value: { slug: '2026-10-19-culto-de-domingo-3' },
    });
  });

  it('deve listar os campos inválidos', async () => {
    const { createAlbum } = setup();

    await expect(
      createAlbum.execute({ title: '', description: 'x'.repeat(2001), occurredOn: '2099-01-01' }),
    ).resolves.toEqual({
      ok: false,
      error: { type: 'invalid_fields', fields: ['title', 'description', 'occurredOn'] },
    });
  });

  it('deve listar os mais recentes primeiro, com cursor e contagem de fotos prontas', async () => {
    const older = albumSnapshot({ id: SECOND_ALBUM_ID, slug: 'antigo', occurredOn: '2026-01-01' });

    const { albumRepository, listAlbums } = setup(
      [older, albumSnapshot()],
      [photoSnapshot(), photoSnapshot({ id: 'p-2', status: 'PROCESSING' })],
    );

    const first = await listAlbums.execute({ status: null, cursor: null, limit: 1 });

    expect(first).toMatchObject({ items: [{ id: ALBUM_ID, photoCount: 1 }], nextCursor: ALBUM_ID });

    expect(albumRepository.lastQuery).toEqual({ status: null, after: null, limit: 2 });

    await expect(
      listAlbums.execute({ status: 'DRAFT', cursor: ALBUM_ID, limit: 5 }),
    ).resolves.toMatchObject({ items: [{ id: SECOND_ALBUM_ID }], nextCursor: null });
  });

  it('deve consultar ou informar not_found', async () => {
    const { getAlbum } = setup();

    await expect(getAlbum.execute(ALBUM_ID)).resolves.toMatchObject({ ok: true });

    await expect(getAlbum.execute(UNKNOWN_ID)).resolves.toEqual({
      ok: false,
      error: { type: 'not_found' },
    });
  });

  it('deve alterar parcialmente com controle otimista, mantendo o slug', async () => {
    const { albumRepository, updateAlbum } = setup();

    await expect(
      updateAlbum.execute({
        id: ALBUM_ID,
        expectedVersion: 1,
        details: { title: 'Culto da Família', description: 'Fotos do culto' },
      }),
    ).resolves.toMatchObject({
      ok: true,
      value: {
        title: 'Culto da Família',
        description: 'Fotos do culto',
        slug: '2026-10-19-culto-de-domingo',
        version: 2,
      },
    });

    await expect(
      updateAlbum.execute({ id: ALBUM_ID, expectedVersion: 1, details: {} }),
    ).resolves.toEqual({ ok: false, error: { type: 'version_conflict' } });

    albumRepository.failNextUpdate = true;

    await expect(
      updateAlbum.execute({ id: ALBUM_ID, expectedVersion: 2, details: { description: null } }),
    ).resolves.toEqual({ ok: false, error: { type: 'version_conflict' } });
  });

  it.each([
    ['inexistente', [albumSnapshot()], UNKNOWN_ID, {}, { type: 'not_found' }],
    [
      'com dados inválidos',
      [albumSnapshot()],
      ALBUM_ID,
      { occurredOn: 'ontem' },
      { type: 'invalid_fields', fields: ['occurredOn'] },
    ],
    [
      'arquivado',
      [albumSnapshot({ status: 'ARCHIVED' })],
      ALBUM_ID,
      { title: 'Outro' },
      { type: 'album_archived' },
    ],
  ])('deve recusar alteração de álbum %s', async (_caso, albums, id, details, error) => {
    const { updateAlbum } = setup(albums);

    await expect(updateAlbum.execute({ id, expectedVersion: 1, details })).resolves.toEqual({
      ok: false,
      error,
    });
  });
});

describe('Envio de fotos', () => {
  it('deve criar fotos PENDING_UPLOAD e devolver URLs de envio na ordem dos arquivos', async () => {
    const { photoRepository, requestUploads } = setup();

    const result = await requestUploads.execute({
      albumId: ALBUM_ID,
      files: [jpeg(), { contentType: 'image/png', byteSize: 2000 }],
    });

    expect(result).toEqual({
      ok: true,
      value: [
        {
          photoId: '01a14f8e-c000-7000-8000-000000000001',
          uploadUrl: `https://s3.test/put/${uploadKey('01a14f8e-c000-7000-8000-000000000001')}?type=image/jpeg&ttl=900`,
          contentType: 'image/jpeg',
          expiresAt: new Date(NOW.getTime() + 900_000).toISOString(),
        },
        expect.objectContaining({ contentType: 'image/png' }),
      ],
    });

    expect([...photoRepository.stored.values()].map(({ status }) => status)).toEqual([
      'PENDING_UPLOAD',
      'PENDING_UPLOAD',
    ]);
  });

  it('deve recusar tipo e tamanho fora das regras, listando os campos', async () => {
    const { requestUploads } = setup();

    await expect(
      requestUploads.execute({
        albumId: ALBUM_ID,
        files: [jpeg(), { contentType: 'image/heic', byteSize: 0 }, jpeg(26 * 1024 * 1024)],
      }),
    ).resolves.toEqual({
      ok: false,
      error: {
        type: 'invalid_fields',
        fields: ['files.1.contentType', 'files.1.byteSize', 'files.2.byteSize'],
      },
    });
  });

  it('deve descartar pedidos abandonados e respeitar o limite de 500 por álbum', async () => {
    const stale = photoSnapshot({ id: 'p-velho', status: 'PENDING_UPLOAD' });

    const full = Array.from({ length: 499 }, (_, index) =>
      photoSnapshot({ id: `p-${String(index).padStart(3, '0')}` }),
    );

    const { photoRepository, requestUploads } = setup([albumSnapshot()], [stale, ...full]);

    photoRepository.createdAt.set('p-velho', new Date(NOW.getTime() - 25 * 60 * 60 * 1000));

    await expect(
      requestUploads.execute({ albumId: ALBUM_ID, files: [jpeg()] }),
    ).resolves.toMatchObject({ ok: true });

    expect(photoRepository.stored.has('p-velho')).toBe(false);

    await expect(requestUploads.execute({ albumId: ALBUM_ID, files: [jpeg()] })).resolves.toEqual({
      ok: false,
      error: { type: 'album_full' },
    });
  });

  it.each([
    ['inexistente', [albumSnapshot()], UNKNOWN_ID, true, { type: 'not_found' }],
    [
      'arquivado',
      [albumSnapshot({ status: 'ARCHIVED' })],
      ALBUM_ID,
      true,
      { type: 'album_archived' },
    ],
    ['sem armazenamento', [albumSnapshot()], ALBUM_ID, false, { type: 'storage_disabled' }],
  ])('deve recusar envio para álbum %s', async (_caso, albums, albumId, enabled, error) => {
    const { requestUploads } = setup(albums, [], { enabled });

    await expect(requestUploads.execute({ albumId, files: [jpeg()] })).resolves.toEqual({
      ok: false,
      error,
    });
  });

  it('deve confirmar o envio, colocar na fila e ser idempotente', async () => {
    const { completeUpload, queue, storage } = setup(
      [albumSnapshot()],
      [photoSnapshot({ status: 'PENDING_UPLOAD' })],
    );

    storage.put(uploadKey(PHOTO_ID), 1234);

    await expect(completeUpload.execute(PHOTO_ID)).resolves.toMatchObject({
      ok: true,
      value: { status: 'PROCESSING', previewUrl: null, version: 2 },
    });

    await expect(completeUpload.execute(PHOTO_ID)).resolves.toMatchObject({
      ok: true,
      value: { status: 'PROCESSING' },
    });

    expect(queue.enqueued).toEqual([PHOTO_ID]);
  });

  it('deve recusar confirmação sem arquivo, grande demais, de foto inexistente ou com falha', async () => {
    const pending = photoSnapshot({ status: 'PENDING_UPLOAD' });

    const { completeUpload, photoRepository, storage } = setup([albumSnapshot()], [pending]);

    await expect(completeUpload.execute(PHOTO_ID)).resolves.toEqual({
      ok: false,
      error: { type: 'upload_missing' },
    });

    storage.put(uploadKey(PHOTO_ID), 26 * 1024 * 1024);

    await expect(completeUpload.execute(PHOTO_ID)).resolves.toEqual({
      ok: false,
      error: { type: 'upload_too_large' },
    });

    expect(storage.objects.has(uploadKey(PHOTO_ID))).toBe(false);

    await expect(completeUpload.execute(UNKNOWN_ID)).resolves.toEqual({
      ok: false,
      error: { type: 'not_found' },
    });

    photoRepository.stored.set(PHOTO_ID, photoSnapshot({ status: 'FAILED' }));

    await expect(completeUpload.execute(PHOTO_ID)).resolves.toEqual({
      ok: false,
      error: { type: 'invalid_photo_status' },
    });

    storage.put(uploadKey(PHOTO_ID), 10);

    photoRepository.stored.set(PHOTO_ID, pending);

    photoRepository.failNextUpdate = true;

    await expect(completeUpload.execute(PHOTO_ID)).resolves.toEqual({
      ok: false,
      error: { type: 'version_conflict' },
    });
  });

  it('deve recusar confirmação sem armazenamento configurado', async () => {
    const { completeUpload } = setup([albumSnapshot()], [], { enabled: false });

    await expect(completeUpload.execute(PHOTO_ID)).resolves.toEqual({
      ok: false,
      error: { type: 'storage_disabled' },
    });
  });
});

const processing = () =>
  setup([albumSnapshot()], [photoSnapshot({ status: 'PROCESSING', variantWidths: [] })]);

describe('Processamento', () => {
  it('deve gravar original e variantes, marcar READY e apagar o envio bruto', async () => {
    const { photoRepository, processPhoto, storage } = processing();

    storage.put(uploadKey(PHOTO_ID), 100);

    await processPhoto.execute(PHOTO_ID);

    expect(photoRepository.stored.get(PHOTO_ID)).toMatchObject({
      status: 'READY',
      width: 800,
      height: 600,
      placeholder: 'data:image/webp;base64,BBBB',
      variantWidths: [320, 640],
    });

    expect([...storage.objects.keys()].toSorted()).toEqual(
      [
        originalKey(ALBUM_ID, PHOTO_ID),
        variantKey(ALBUM_ID, PHOTO_ID, 320, 'avif'),
        variantKey(ALBUM_ID, PHOTO_ID, 320, 'webp'),
        variantKey(ALBUM_ID, PHOTO_ID, 640, 'avif'),
        variantKey(ALBUM_ID, PHOTO_ID, 640, 'webp'),
      ].toSorted(),
    );

    expect(storage.objects.get(variantKey(ALBUM_ID, PHOTO_ID, 640, 'avif'))?.contentType).toBe(
      'image/avif',
    );
  });

  it.each([
    ['conteúdo que não é imagem', null, true, 'invalid_image'],
    ['envio bruto ausente', processedImage(), false, 'processing_error'],
    ['erro do processador', new Error('libvips'), true, 'processing_error'],
  ] as const)('deve marcar FAILED com %s', async (_caso, result, hasUpload, failure) => {
    const { photoRepository, processPhoto, processor, storage } = processing();

    processor.result = result;

    if (hasUpload) {
      storage.put(uploadKey(PHOTO_ID), 100);
    }

    await processPhoto.execute(PHOTO_ID);

    expect(photoRepository.stored.get(PHOTO_ID)).toMatchObject({ status: 'FAILED', failure });

    expect(storage.objects.size).toBe(0);
  });

  it('deve apagar o que gravou quando falha no meio ou a foto some', async () => {
    const failing = processing();

    failing.storage.put(uploadKey(PHOTO_ID), 100);

    failing.storage.failNextWrite = true;

    await failing.processPhoto.execute(PHOTO_ID);

    expect(failing.storage.objects.size).toBe(0);

    const removed = processing();

    removed.storage.put(uploadKey(PHOTO_ID), 100);

    removed.photoRepository.failNextUpdate = true;

    await removed.processPhoto.execute(PHOTO_ID);

    expect(removed.storage.objects.size).toBe(0);
  });

  it('deve ignorar foto inexistente ou que não está em processamento', async () => {
    const { photoRepository, processPhoto } = setup([albumSnapshot()], [photoSnapshot()]);

    await processPhoto.execute(UNKNOWN_ID);

    await processPhoto.execute(PHOTO_ID);

    expect(photoRepository.stored.get(PHOTO_ID)?.status).toBe('READY');
  });

  it('deve retomar as fotos que estavam em processamento', async () => {
    const { queue, resume } = setup(
      [albumSnapshot()],
      [photoSnapshot({ status: 'PROCESSING' }), photoSnapshot({ id: 'p-2' })],
    );

    await expect(resume.execute()).resolves.toBe(1);

    expect(queue.enqueued).toEqual([PHOTO_ID]);
  });
});

describe('Listagem e exclusão de fotos', () => {
  it('deve listar as fotos enviadas com miniatura assinada das prontas', async () => {
    const { listPhotos } = setup(
      [albumSnapshot()],
      [
        photoSnapshot(),
        photoSnapshot({ id: 'p-2', status: 'PROCESSING', variantWidths: [] }),
        photoSnapshot({ id: 'p-3', status: 'PENDING_UPLOAD' }),
        photoSnapshot({ id: 'p-4', variantWidths: [200] }),
      ],
    );

    const page = await listPhotos.execute({ albumId: ALBUM_ID, cursor: null, limit: 2 });

    expect(page).toMatchObject({
      ok: true,
      value: {
        items: [
          {
            id: PHOTO_ID,
            previewUrl: `https://s3.test/get/${variantKey(ALBUM_ID, PHOTO_ID, 640, 'webp')}?ttl=3600`,
          },
          { id: 'p-2', previewUrl: null },
        ],
        nextCursor: 'p-2',
      },
    });

    await expect(
      listPhotos.execute({ albumId: ALBUM_ID, cursor: 'p-2', limit: 5 }),
    ).resolves.toMatchObject({
      ok: true,
      value: {
        items: [{ id: 'p-4', previewUrl: expect.stringContaining('/200.webp') }],
        nextCursor: null,
      },
    });

    await expect(
      listPhotos.execute({ albumId: UNKNOWN_ID, cursor: null, limit: 5 }),
    ).resolves.toEqual({ ok: false, error: { type: 'not_found' } });
  });

  it('não deve assinar miniaturas sem armazenamento configurado', async () => {
    const { listPhotos } = setup([albumSnapshot()], [photoSnapshot()], { enabled: false });

    await expect(
      listPhotos.execute({ albumId: ALBUM_ID, cursor: null, limit: 5 }),
    ).resolves.toMatchObject({ ok: true, value: { items: [{ previewUrl: null }] } });
  });

  it('deve excluir objetos privados e metadados', async () => {
    const { deletePhoto, photoRepository, storage } = setup([albumSnapshot()], [photoSnapshot()]);

    storage.put(originalKey(ALBUM_ID, PHOTO_ID), 10);

    storage.put(variantKey(ALBUM_ID, PHOTO_ID, 1024, 'avif'), 10);

    await expect(deletePhoto.execute(PHOTO_ID)).resolves.toEqual({ ok: true, value: undefined });

    expect(storage.objects.size).toBe(0);

    expect(photoRepository.stored.size).toBe(0);

    await expect(deletePhoto.execute(PHOTO_ID)).resolves.toEqual({
      ok: false,
      error: { type: 'not_found' },
    });
  });

  it('deve excluir só os metadados sem armazenamento configurado', async () => {
    const { deletePhoto, photoRepository } = setup([albumSnapshot()], [photoSnapshot()], {
      enabled: false,
    });

    await expect(deletePhoto.execute(PHOTO_ID)).resolves.toMatchObject({ ok: true });

    expect(photoRepository.stored.size).toBe(0);
  });
});
