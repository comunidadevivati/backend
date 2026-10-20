import { describe, expect, it } from 'vitest';
import { Album } from '../domain/album.js';
import { Photo } from '../domain/photo.js';
import { albumSnapshot, photoSnapshot } from '../gallery.fixtures.js';
import { DrizzleAlbumRepository, DrizzlePhotoRepository } from './drizzle-gallery.repositories.js';
import type { Database } from '../../../shared/infrastructure/database/database.js';
import type { DatabaseService } from '../../../shared/infrastructure/database/database.service.js';

interface RecordedCall {
  method: string;
  args: unknown[];
}

// Simula o query builder do Drizzle: cada consulta aguardada consome o próximo resultado da fila;
// um Error na fila é lançado. O SQL real é coberto pelo teste de integração.
const createDatabase = (results: unknown[] = []) => {
  const calls: RecordedCall[] = [];

  const queue = [...results];

  const chain: object = new Proxy(
    {},
    {
      get: (_target, property) => {
        if (property === 'then') {
          const result = queue.shift() ?? [];

          return (resolve: (value: unknown) => void, reject: (reason: unknown) => void) => {
            if (result instanceof Error) {
              reject(result);
            } else {
              resolve(result);
            }
          };
        }

        return (...args: unknown[]) => {
          calls.push({ method: String(property), args });

          return chain;
        };
      },
    },
  );

  return { calls, service: { db: chain as Database } as DatabaseService };
};

const uniqueViolation = Object.assign(new Error('duplicada'), { code: '23505' });

const albumRow = { ...albumSnapshot(), photoCount: 3 };

const photoRow = {
  ...photoSnapshot(),
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe('DrizzleAlbumRepository', () => {
  it('deve reconstituir o álbum, devolver a visão e listar com filtros', async () => {
    const { calls, service } = createDatabase([[albumSnapshot()], [], [albumRow], [], [albumRow]]);

    const repository = new DrizzleAlbumRepository(service);

    expect((await repository.findById('a'))?.toSnapshot()).toEqual(albumSnapshot());

    await expect(repository.findById('x')).resolves.toBeNull();

    await expect(repository.findView('a')).resolves.toEqual(albumRow);

    await expect(repository.findView('x')).resolves.toBeNull();

    expect(await repository.list({ status: 'DRAFT', after: 'a-0', limit: 21 })).toEqual([albumRow]);

    expect(calls.findLast(({ method }) => method === 'limit')?.args).toEqual([21]);
  });

  it('deve inserir, traduzir slug repetido e atualizar com controle otimista', async () => {
    const { service } = createDatabase([
      [],
      uniqueViolation,
      new Error('rede'),
      [{ version: 2 }],
      [],
    ]);

    const repository = new DrizzleAlbumRepository(service);

    const album = Album.restore(albumSnapshot());

    await expect(repository.insert(album)).resolves.toBe('inserted');

    await expect(repository.insert(album)).resolves.toBe('slug_taken');

    await expect(repository.insert(album)).rejects.toThrow('rede');

    await expect(repository.update(album)).resolves.toBe(2);

    await expect(repository.update(album)).resolves.toBeNull();
  });
});

describe('DrizzlePhotoRepository', () => {
  it('deve consultar, listar e contar fotos', async () => {
    const { calls, service } = createDatabase([
      [photoRow],
      [],
      [photoRow],
      [{ total: 4 }],
      [],
      [photoRow],
    ]);

    const repository = new DrizzlePhotoRepository(service);

    expect((await repository.findById('p'))?.toSnapshot()).toEqual(photoSnapshot());

    await expect(repository.findById('x')).resolves.toBeNull();

    await expect(
      repository.listByAlbum({ albumId: 'a', after: 'p-0', limit: 61 }),
    ).resolves.toEqual([photoSnapshot()]);

    await expect(repository.countByAlbum('a')).resolves.toBe(4);

    await expect(repository.countByAlbum('a')).resolves.toBe(0);

    await expect(repository.listByStatus('PROCESSING')).resolves.toEqual([photoSnapshot()]);

    expect(calls.some(({ method }) => method === 'orderBy')).toBe(true);
  });

  it('deve inserir em lote, atualizar, excluir e descartar pedidos abandonados', async () => {
    const { calls, service } = createDatabase([[], [{ version: 2 }], [], [], []]);

    const repository = new DrizzlePhotoRepository(service);

    await repository.insertMany([]);

    await repository.insertMany([Photo.request('p-1', 'a', 'image/jpeg', 10)]);

    expect(calls.find(({ method }) => method === 'values')?.args[0]).toEqual([
      {
        id: 'p-1',
        albumId: 'a',
        status: 'PENDING_UPLOAD',
        contentType: 'image/jpeg',
        byteSize: 10,
      },
    ]);

    const photo = Photo.restore(photoSnapshot());

    await expect(repository.update(photo)).resolves.toBe(2);

    await expect(repository.update(photo)).resolves.toBeNull();

    await repository.delete('p-1');

    await repository.deletePendingCreatedBefore('a', new Date());

    expect(calls.filter(({ method }) => method === 'delete')).toHaveLength(2);
  });
});
