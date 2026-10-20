import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { call } from './support/core-api-test-context.js';
import { mediaClient, objectUrl } from './support/media-storage-context.js';

interface Album {
  id: string;
  slug: string;
  version: number;
  photoCount: number;
}

interface Ticket {
  photoId: string;
  uploadUrl: string;
  contentType: string;
}

interface PhotoView {
  id: string;
  status: string;
  width: number | null;
  height: number | null;
  placeholder: string | null;
  failure: string | null;
  previewUrl: string | null;
}

const createAlbum = async (title: string) => {
  const response = await call('POST', 'gallery/albums', { title, occurredOn: '2026-10-18' });

  expect(response.statusCode).toBe(201);

  return response.json<Album>();
};

const requestUploads = async (
  albumId: string,
  files: { contentType: string; byteSize: number }[],
) => {
  const response = await call('POST', `gallery/albums/${albumId}/uploads`, { files });

  expect(response.statusCode).toBe(201);

  return response.json<{ items: Ticket[] }>().items;
};

const upload = (ticket: Ticket, body: Uint8Array, contentType = ticket.contentType) =>
  fetch(ticket.uploadUrl, { method: 'PUT', headers: { 'content-type': contentType }, body });

const listPhotos = async (albumId: string) =>
  (await call('GET', `gallery/albums/${albumId}/photos`)).json<{ items: PhotoView[] }>().items;

// O processamento é assíncrono: espera até nenhuma foto do álbum estar em PROCESSING.
const waitProcessed = async (albumId: string): Promise<PhotoView[]> => {
  const deadline = Date.now() + 60_000;

  for (;;) {
    // oxlint-disable-next-line no-await-in-loop -- consulta periódica até o fim do processamento
    const items = await listPhotos(albumId);

    if (items.every(({ status }) => status !== 'PROCESSING') || Date.now() > deadline) {
      return items;
    }

    // oxlint-disable-next-line no-await-in-loop -- intervalo entre as consultas
    await new Promise((resolve) => {
      setTimeout(resolve, 200);
    });
  }
};

const status = async (key: string) =>
  (await mediaClient.fetch(objectUrl(key), { method: 'HEAD' })).status;

const photoWithGps = async () =>
  new Uint8Array(
    await sharp({ create: { width: 1800, height: 1200, channels: 3, background: '#2b6' } })
      .jpeg()
      .withMetadata({ orientation: 6 })
      .withExifMerge({ IFD3: { GPSLatitudeRef: 'S', GPSLatitude: '20/1 27/1 0/1' } })
      .toBuffer(),
  );

describe('Galeria (PostgreSQL e emulador S3 reais)', () => {
  it('deve exigir a credencial de serviço', async () => {
    const response = await call('GET', 'gallery/albums', undefined, 'invalido');

    expect(response.statusCode).toBe(401);
  });

  it('deve criar, listar e alterar álbuns, com slug estável', async () => {
    const album = await createAlbum('Culto de Ação de Graças');

    expect(album).toMatchObject({
      slug: '2026-10-18-culto-de-acao-de-gracas',
      status: 'DRAFT',
      photoCount: 0,
    });

    const repeated = await createAlbum('Culto de Ação de Graças');

    expect(repeated.slug).toBe('2026-10-18-culto-de-acao-de-gracas-2');

    const updated = await call('PATCH', `gallery/albums/${album.id}`, {
      version: 1,
      title: 'Ação de Graças',
    });

    expect(updated.json()).toMatchObject({ title: 'Ação de Graças', slug: album.slug, version: 2 });

    const stale = await call('PATCH', `gallery/albums/${album.id}`, { version: 1, title: 'X' });

    expect(stale.statusCode).toBe(409);

    const first = await call('GET', 'gallery/albums?limit=1');

    const page = first.json<{ items: Album[]; nextCursor: string }>();

    expect(page.items).toHaveLength(1);

    const second = await call('GET', `gallery/albums?limit=1&cursor=${page.nextCursor}`);

    expect(second.json<{ items: Album[] }>().items[0]?.id).not.toBe(page.items[0]?.id);
  });

  it('deve enviar direto ao bucket, processar, assinar a miniatura e excluir', async () => {
    const album = await createAlbum('Batismo');

    const jpeg = await photoWithGps();

    const fake = new TextEncoder().encode('isto não é uma imagem');

    const [real, invalid] = await requestUploads(album.id, [
      { contentType: 'image/jpeg', byteSize: jpeg.byteLength },
      { contentType: 'image/png', byteSize: fake.byteLength },
    ]);

    if (!real || !invalid) {
      throw new Error('Pedido de envio sem os dois tickets.');
    }

    // O Content-Type faz parte da assinatura: outro tipo é recusado pelo bucket.
    expect((await upload(real, jpeg, 'text/plain')).status).toBe(403);

    expect((await upload(real, jpeg)).status).toBe(200);

    expect((await upload(invalid, fake)).status).toBe(200);

    for (const { photoId } of [real, invalid]) {
      // oxlint-disable-next-line no-await-in-loop -- confirmações na ordem do envio
      const completed = await call('POST', `gallery/photos/${photoId}/complete`);

      expect(completed.statusCode).toBe(202);
    }

    const photos = await waitProcessed(album.id);

    expect(photos.find(({ id }) => id === real.photoId)).toMatchObject({
      status: 'READY',
      // Orientação EXIF 6: a foto deitada vira retrato.
      width: 1200,
      height: 1800,
      placeholder: expect.stringMatching(/^data:image\/webp;base64,/u),
      failure: null,
    });

    expect(photos.find(({ id }) => id === invalid.photoId)).toMatchObject({
      status: 'FAILED',
      failure: 'invalid_image',
      previewUrl: null,
    });

    const preview = photos.find(({ id }) => id === real.photoId)?.previewUrl ?? '';

    const thumbnail = await fetch(preview);

    expect(thumbnail.status).toBe(200);

    const metadata = await sharp(new Uint8Array(await thumbnail.arrayBuffer())).metadata();

    expect(metadata).toMatchObject({ format: 'webp', width: 640 });

    expect(metadata.exif).toBeUndefined();

    const albumKey = `gallery/private/albums/${album.id}`;

    expect(await status(`gallery/uploads/${real.photoId}`)).toBe(404);

    expect(await status(`${albumKey}/originals/${real.photoId}.jpg`)).toBe(200);

    expect(await status(`${albumKey}/photos/${real.photoId}/1024.avif`)).toBe(200);

    expect((await call('GET', `gallery/albums/${album.id}`)).json()).toMatchObject({
      photoCount: 1,
    });

    const removed = await call('DELETE', `gallery/photos/${real.photoId}`);

    expect(removed.statusCode).toBe(204);

    expect(await status(`${albumKey}/originals/${real.photoId}.jpg`)).toBe(404);

    expect(await status(`${albumKey}/photos/${real.photoId}/320.webp`)).toBe(404);

    expect((await listPhotos(album.id)).map(({ id }) => id)).toEqual([invalid.photoId]);
  });

  it('deve recusar confirmação sem arquivo e pedidos fora das regras', async () => {
    const album = await createAlbum('Santa Ceia');

    const [ticket] = await requestUploads(album.id, [{ contentType: 'image/webp', byteSize: 10 }]);

    const missing = await call('POST', `gallery/photos/${ticket?.photoId ?? ''}/complete`);

    expect(missing.statusCode).toBe(409);

    expect(missing.json()).toMatchObject({
      detail: 'O arquivo não chegou ao armazenamento. Envie a foto novamente.',
    });

    const invalid = await call('POST', `gallery/albums/${album.id}/uploads`, {
      files: [{ contentType: 'image/heic', byteSize: 10 }],
    });

    expect(invalid.statusCode).toBe(400);

    expect(invalid.json()).toMatchObject({ fields: ['files.0.contentType'] });

    const unknown = await call(
      'POST',
      'gallery/albums/01a14f8e-ffff-7000-8000-000000000000/uploads',
      {
        files: [{ contentType: 'image/jpeg', byteSize: 10 }],
      },
    );

    expect(unknown.statusCode).toBe(404);
  });
});
