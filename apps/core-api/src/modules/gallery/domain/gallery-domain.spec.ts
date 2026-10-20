import { describe, expect, it } from 'vitest';
import { albumSnapshot, photoSnapshot, TODAY } from '../gallery.fixtures.js';
import { Album } from './album.js';
import { Photo, isAcceptedPhotoType, variantWidthsFor } from './photo.js';
import {
  AlbumDescription,
  AlbumTitle,
  OccurrenceDate,
  albumSlug,
} from './value-objects/album-details.js';

const valueOf = <T extends { value: string }>(result: { ok: true; value: T } | { ok: false }) =>
  result.ok ? result.value.value : null;

const details = (title = 'Culto de Domingo') => {
  const [name, date] = [AlbumTitle.create(title), OccurrenceDate.create('2026-10-19', TODAY)];

  if (!name.ok || !date.ok) {
    throw new Error('Dados de teste inválidos.');
  }

  return { title: name.value, description: null, occurredOn: date.value };
};

describe('Value Objects do álbum', () => {
  it('deve colapsar espaços do título e limitar a 120 caracteres', () => {
    expect(valueOf(AlbumTitle.create('  Culto   de  Domingo '))).toBe('Culto de Domingo');

    expect(AlbumTitle.create('  ').ok).toBe(false);

    expect(AlbumTitle.create('a'.repeat(121)).ok).toBe(false);
  });

  it('deve aceitar descrição de até 2000 caracteres', () => {
    expect(valueOf(AlbumDescription.create(' Linha 1\nLinha 2 '))).toBe('Linha 1\nLinha 2');

    expect(AlbumDescription.create('a'.repeat(2001)).ok).toBe(false);
  });

  it.each([
    ['inexistente', '2026-02-30'],
    ['futura', '2026-10-21'],
    ['anterior a 2000', '1999-12-31'],
    ['fora do formato ISO', '19/10/2026'],
  ])('deve recusar data %s', (_caso, raw) => {
    expect(OccurrenceDate.create(raw, TODAY).ok).toBe(false);
  });

  it('deve gerar slug com a data e o título sem acentos', () => {
    const { occurredOn, title } = details("Culto de Ação de Graças — Família D'Ávila");

    expect(albumSlug(occurredOn, title)).toBe('2026-10-19-culto-de-acao-de-gracas-familia-d-avila');

    const symbols = details('!!!');

    expect(albumSlug(symbols.occurredOn, symbols.title)).toBe('2026-10-19');
  });
});

describe('Album', () => {
  it('deve nascer DRAFT na versão 1, sem capa', () => {
    expect(Album.create('a-1', 'slug', details()).toSnapshot()).toEqual({
      id: 'a-1',
      slug: 'slug',
      title: 'Culto de Domingo',
      description: null,
      occurredOn: '2026-10-19',
      coverPhotoId: null,
      status: 'DRAFT',
      publishedAt: null,
      version: 1,
    });
  });

  it('deve alterar os dados mantendo o slug, salvo se arquivado', () => {
    const album = Album.restore(albumSnapshot());

    expect(album.updateDetails(details('Outro Título')).ok).toBe(true);

    expect(album.toSnapshot()).toMatchObject({ title: 'Outro Título', slug: albumSnapshot().slug });

    const archived = Album.restore(albumSnapshot({ status: 'ARCHIVED' }));

    expect(archived.acceptsPhotos).toBe(false);

    expect(archived.updateDetails(details()).ok).toBe(false);
  });
});

describe('Photo', () => {
  it('deve seguir PENDING_UPLOAD → PROCESSING → READY', () => {
    const photo = Photo.request('p-1', 'a-1', 'image/png', 10);

    expect(photo.status).toBe('PENDING_UPLOAD');

    expect(photo.markUploaded(12).ok).toBe(true);

    expect(photo.markUploaded(12).ok).toBe(false);

    photo.markReady({ width: 800, height: 600, placeholder: 'p', variantWidths: [320, 640] });

    expect(photo.toSnapshot()).toMatchObject({
      status: 'READY',
      byteSize: 12,
      width: 800,
      variantWidths: [320, 640],
      failure: null,
    });
  });

  it('deve registrar a falha e não compartilhar o estado interno', () => {
    const photo = Photo.restore(photoSnapshot({ status: 'PROCESSING' }));

    photo.markFailed('invalid_image');

    const snapshot = photo.toSnapshot();

    snapshot.variantWidths.push(9999);

    expect(photo.toSnapshot()).toMatchObject({ status: 'FAILED', failure: 'invalid_image' });

    expect(photo.variantWidths).not.toContain(9999);
  });

  it('deve escolher as variantes até a largura real', () => {
    expect(variantWidthsFor(4096)).toEqual([320, 640, 1024, 1600, 2048]);

    expect(variantWidthsFor(1100)).toEqual([320, 640, 1024]);

    expect(variantWidthsFor(200)).toEqual([200]);
  });

  it('deve aceitar somente JPEG, PNG e WebP', () => {
    expect(
      ['image/jpeg', 'image/png', 'image/webp'].every((type) => isAcceptedPhotoType(type)),
    ).toBe(true);

    expect(isAcceptedPhotoType('image/heic')).toBe(false);
  });
});
