import { describe, expect, it, vi } from 'vitest';
import { CoreApiForwarder } from '../../core-api/presentation/core-api-forwarder.service.js';
import { MembersController, MembershipsController } from './members.controllers.js';
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
    assertCsrfToken,
    members: new MembersController(forwarder),
    memberships: new MembershipsController(forwarder),
    reply: reply as unknown as FastifyReply,
    request: {} as FastifyRequest,
    send,
  };
};

describe('Rotas web de Members', () => {
  it('deve mapear cada rota de membros, repassando somente filtros conhecidos', async () => {
    const { members, reply, request, send } = createFixture();

    await members.list(
      { status: 'ACTIVE', search: 'maria', congregationId: ID, extra: 'x', limit: ['1'] },
      request,
      reply,
    );

    await members.get(ID, request, reply);

    await members.register(undefined, request, reply);

    await members.update(ID, { version: 1 }, request, reply);

    for (const action of ['activate', 'deactivate', 'archive', 'restore'] as const) {
      await members[action](ID, request, reply);
    }

    await members.memberships(ID, request, reply);

    await members.addMembership(ID, undefined, request, reply);

    expect(send.mock.calls).toEqual([
      [
        {
          method: 'GET',
          path: 'members',
          query: { status: 'ACTIVE', congregationId: ID, search: 'maria' },
        },
      ],
      [{ method: 'GET', path: `members/${ID}` }],
      [{ method: 'POST', path: 'members', body: {} }],
      [{ method: 'PATCH', path: `members/${ID}`, body: { version: 1 } }],
      [{ method: 'POST', path: `members/${ID}/activate` }],
      [{ method: 'POST', path: `members/${ID}/deactivate` }],
      [{ method: 'POST', path: `members/${ID}/archive` }],
      [{ method: 'POST', path: `members/${ID}/restore` }],
      [{ method: 'GET', path: `members/${ID}/memberships` }],
      [{ method: 'POST', path: `members/${ID}/memberships`, body: {} }],
    ]);
  });

  it('deve mapear as mudanças de situação dos vínculos, exigindo CSRF', async () => {
    const { assertCsrfToken, memberships, reply, request, send } = createFixture();

    await memberships.activate(ID, request, reply);

    await memberships.deactivate(ID, request, reply);

    expect(send.mock.calls).toEqual([
      [{ method: 'POST', path: `memberships/${ID}/activate` }],
      [{ method: 'POST', path: `memberships/${ID}/deactivate` }],
    ]);

    expect(assertCsrfToken).toHaveBeenCalledTimes(2);
  });

  it('deve responder 404 para IDs fora do formato UUID sem chamar a Core API', () => {
    const { members, memberships, reply, request, send } = createFixture();

    expect(() => members.get('../organization', request, reply)).toThrow(
      'Registro não encontrado.',
    );

    expect(() => memberships.activate('x', request, reply)).toThrow('Registro não encontrado.');

    expect(send).not.toHaveBeenCalled();
  });
});
