import sharp from 'sharp';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { InProcessPhotoQueue } from './in-process-photo.queue.js';
import {
  DisabledPrivateMediaStorage,
  MediaStorageError,
  S3PrivateMediaStorage,
} from './s3-private-media.storage.js';
import { SharpImageProcessor } from './sharp-image.processor.js';
import { SystemClock, UuidV7IdGenerator } from './system.adapters.js';

// Foto de teste 1200x800 com orientação EXIF 6 (girada 90°) e coordenadas GPS.
const photoWithGps = () =>
  sharp({ create: { width: 1200, height: 800, channels: 3, background: '#3a7' } })
    .jpeg()
    .withMetadata({ orientation: 6 })
    .withExifMerge({ IFD3: { GPSLatitudeRef: 'S', GPSLatitude: '20/1 27/1 0/1' } })
    .toBuffer();

describe('SharpImageProcessor', () => {
  const processor = new SharpImageProcessor();

  it('deve aplicar a rotação, remover metadados e gerar variantes AVIF e WebP', async () => {
    const input = await photoWithGps();

    expect((await sharp(input).metadata()).orientation).toBe(6);

    const result = await processor.process(new Uint8Array(input));

    expect(result).not.toBeNull();

    // A orientação 6 troca largura e altura.
    expect(result).toMatchObject({ width: 800, height: 1200 });

    expect(result?.placeholder).toMatch(/^data:image\/webp;base64,/u);

    expect(result?.variants.map(({ format, width }) => `${width}.${format}`)).toEqual([
      '320.avif',
      '320.webp',
      '640.avif',
      '640.webp',
    ]);

    const original = await sharp(result?.original).metadata();

    expect(original).toMatchObject({ format: 'jpeg', width: 800, height: 1200 });

    expect(original.exif).toBeUndefined();

    const variant = await sharp(result?.variants[1]?.body).metadata();

    expect(variant).toMatchObject({ format: 'webp', width: 320 });

    expect(variant.exif).toBeUndefined();
  });

  it('deve reduzir o original a 4096 px e aceitar PNG com transparência', async () => {
    const png = await sharp({
      create: {
        width: 5000,
        height: 1000,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      },
    })
      .png()
      .toBuffer();

    const result = await processor.process(new Uint8Array(png));

    expect(result).toMatchObject({ width: 4096, height: 819 });

    expect(result?.variants.filter(({ format }) => format === 'webp')).toHaveLength(5);
  });

  it.each([
    ['texto', new TextEncoder().encode('não é imagem')],
    ['GIF', new Uint8Array(Buffer.from('R0lGODlhAQABAAAAACw=', 'base64'))],
  ])('deve recusar %s', async (_caso, input) => {
    await expect(processor.process(input)).resolves.toBeNull();
  });
});

describe('InProcessPhotoQueue', () => {
  it('deve processar uma foto por vez, sem duplicar, só depois de iniciada', async () => {
    const queue = new InProcessPhotoQueue();

    const order: string[] = [];

    let running = 0;

    queue.enqueue('a');

    queue.enqueue('a');

    queue.start(async (id) => {
      running += 1;

      expect(running).toBe(1);

      await Promise.resolve();

      order.push(id);

      running -= 1;

      if (id === 'b') {
        throw new Error('falha isolada');
      }
    });

    queue.enqueue('b');

    queue.enqueue('c');

    await queue.idle();

    expect(order).toEqual(['a', 'b', 'c']);

    await expect(queue.idle()).resolves.toBeUndefined();
  });
});

const stubFetch = (...responses: Response[]) => {
  const fetch = vi.fn<typeof globalThis.fetch>();

  for (const response of responses) {
    fetch.mockResolvedValueOnce(response);
  }

  vi.stubGlobal('fetch', fetch);

  return fetch;
};

const requestOf = (fetch: ReturnType<typeof stubFetch>, index = 0): Request =>
  fetch.mock.calls[index]?.[0] as Request;

describe('S3PrivateMediaStorage', () => {
  const storage = new S3PrivateMediaStorage({
    endpoint: 'https://conta.r2.cloudflarestorage.com/',
    region: 'auto',
    accessKeyId: 'chave',
    secretAccessKey: 'segredo',
    bucket: 'midia',
    keyPrefix: 'hml',
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('deve assinar URLs de envio e leitura no bucket, com validade e Content-Type', async () => {
    const upload = new URL(await storage.presignUpload('gallery/uploads/p 1', 'image/png', 900));

    expect(upload.origin + upload.pathname).toBe(
      'https://conta.r2.cloudflarestorage.com/midia/hml/gallery/uploads/p%201',
    );

    expect(upload.searchParams.get('X-Amz-Expires')).toBe('900');

    expect(upload.searchParams.get('X-Amz-SignedHeaders')).toContain('content-type');

    const download = new URL(await storage.presignDownload('a/b.webp', 60));

    expect(download.searchParams.get('X-Amz-Signature')).toMatch(/^[\da-f]{64}$/u);
  });

  it('deve consultar tamanho, ler, gravar e apagar objetos', async () => {
    const fetch = stubFetch(
      new Response(null, { status: 200, headers: { 'content-length': '42' } }),
      new Response(null, { status: 404 }),
      new Response(new Uint8Array([7, 8]), { status: 200 }),
      new Response(null, { status: 404 }),
      new Response(null, { status: 200 }),
      new Response(null, { status: 204 }),
      new Response(null, { status: 404 }),
    );

    await expect(storage.size('k')).resolves.toBe(42);

    await expect(storage.size('k')).resolves.toBeNull();

    await expect(storage.read('k')).resolves.toEqual(new Uint8Array([7, 8]));

    await expect(storage.read('k')).resolves.toBeNull();

    await storage.write('k', new Uint8Array([1]), 'image/avif');

    expect(requestOf(fetch, 4).method).toBe('PUT');

    expect(requestOf(fetch, 4).headers.get('content-type')).toBe('image/avif');

    await storage.delete(['k1', 'k2']);

    expect(fetch).toHaveBeenCalledTimes(7);
  });

  it('deve falhar com erro sem detalhes da chave em respostas inesperadas', async () => {
    stubFetch(new Response(null, { status: 403 }), new Response(null, { status: 403 }));

    await expect(storage.read('segredo/chave')).rejects.toThrow(
      new MediaStorageError('GET', 403).message,
    );

    await expect(storage.delete(['k'])).rejects.toBeInstanceOf(MediaStorageError);
  });
});

describe('DisabledPrivateMediaStorage e adaptadores do sistema', () => {
  it('deve recusar qualquer operação quando desativado', async () => {
    const storage = new DisabledPrivateMediaStorage();

    expect(storage.enabled).toBe(false);

    for (const call of [
      () => storage.presignUpload(),
      () => storage.presignDownload(),
      () => storage.size(),
      () => storage.read(),
      () => storage.write(),
      () => storage.delete(),
    ]) {
      // oxlint-disable-next-line no-await-in-loop -- cada operação é verificada isoladamente
      await expect(call()).rejects.toThrow('MEDIA_STORAGE=disabled');
    }
  });

  it('deve informar a data civil, o instante atual e gerar UUIDv7', () => {
    expect(new SystemClock().today()).toMatch(/^\d{4}-\d{2}-\d{2}$/u);

    expect(new SystemClock().now()).toBeInstanceOf(Date);

    expect(new UuidV7IdGenerator().next()).toMatch(/^[\da-f]{8}-[\da-f]{4}-7/u);
  });
});
