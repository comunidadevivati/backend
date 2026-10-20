import { describe, expect, it, vi } from 'vitest';
import { CoreApiForwarder } from '../../core-api/presentation/core-api-forwarder.service.js';
import { GalleryAlbumsController, GalleryPhotosController } from './gallery.controllers.js';
import type { SessionCookieService } from '../../auth/presentation/session-cookie.service.js';
import type { CoreApiClient } from '../../core-api/infrastructure/core-api.client.js';
import type { FastifyReply, FastifyRequest } from 'fastify';

const ID = '01a14f8e-a000-7000-8000-000000000001';

const createFixture = () => {
  const send = vi.fn(() =>
    Promise.resolve({ status: 200, contentType: 'application/json', body: {} }),
  );

  const assertCsrfToken = vi.fn();

  const sessionCookies = {
    requireSession: vi.fn(() => Promise.resolve({ session: { emailVerified: true } })),
    assertCsrfToken,
  } as unknown as SessionCookieService;

  const forwarder = new CoreApiForwarder(sessionCookies, { send } as unknown as CoreApiClient);

  const reply = { status: vi.fn(), header: vi.fn() };

  reply.status.mockReturnValue(reply);

  return {
    albums: new GalleryAlbumsController(forwarder),
    assertCsrfToken,
    photos: new GalleryPhotosController(forwarder),
    reply: reply as unknown as FastifyReply,
    request: {} as FastifyRequest,
    send,
  };
};

describe('Rotas web da galeria', () => {
  it('deve mapear as rotas de álbuns, repassando somente filtros conhecidos', async () => {
    const { albums, assertCsrfToken, reply, request, send } = createFixture();

    await albums.list({ status: 'DRAFT', extra: 'x', limit: ['1'] }, request, reply);

    await albums.create(undefined, request, reply);

    await albums.get(ID, request, reply);

    await albums.update(ID, { version: 1 }, request, reply);

    await albums.photos(ID, { cursor: ID, search: 'x' }, request, reply);

    await albums.uploads(ID, undefined, request, reply);

    expect(send.mock.calls).toEqual([
      [{ method: 'GET', path: 'gallery/albums', query: { status: 'DRAFT' } }],
      [{ method: 'POST', path: 'gallery/albums', body: {} }],
      [{ method: 'GET', path: `gallery/albums/${ID}` }],
      [{ method: 'PATCH', path: `gallery/albums/${ID}`, body: { version: 1 } }],
      [{ method: 'GET', path: `gallery/albums/${ID}/photos`, query: { cursor: ID } }],
      [{ method: 'POST', path: `gallery/albums/${ID}/uploads`, body: {} }],
    ]);

    // Somente as alterações exigem CSRF.
    expect(assertCsrfToken).toHaveBeenCalledTimes(3);
  });

  it('deve confirmar envio e excluir foto, exigindo CSRF', async () => {
    const { assertCsrfToken, photos, reply, request, send } = createFixture();

    await photos.complete(ID, request, reply);

    await photos.delete(ID, request, reply);

    expect(send.mock.calls).toEqual([
      [{ method: 'POST', path: `gallery/photos/${ID}/complete` }],
      [{ method: 'DELETE', path: `gallery/photos/${ID}` }],
    ]);

    expect(assertCsrfToken).toHaveBeenCalledTimes(2);
  });

  it('deve responder 404 para IDs fora do formato UUID sem chamar a Core API', () => {
    const { albums, photos, reply, request, send } = createFixture();

    expect(() => albums.get('../users', request, reply)).toThrow('Registro não encontrado.');

    expect(() => photos.delete('x', request, reply)).toThrow('Registro não encontrado.');

    expect(send).not.toHaveBeenCalled();
  });
});
