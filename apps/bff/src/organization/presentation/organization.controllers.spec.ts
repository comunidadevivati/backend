import { UnauthorizedException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import {
  CoreApiUnavailableError,
  type CoreApiClient,
  type CoreApiResponse,
} from '../../core-api/infrastructure/core-api.client.js';
import { CoreApiForwarder } from './core-api-forwarder.service.js';
import { CongregationsController, OrganizationController } from './organization.controllers.js';
import type { SessionCookieService } from '../../auth/presentation/session-cookie.service.js';
import type { FastifyReply, FastifyRequest } from 'fastify';

const ID = '01a14f8e-8ea5-7368-af3f-f594815a5aba';

const okResponse: CoreApiResponse = {
  status: 200,
  contentType: 'application/json; charset=utf-8',
  body: { id: ID },
};

const createFixture = ({
  emailVerified = true,
  response = okResponse as CoreApiResponse | Error,
  csrfValid = true,
} = {}) => {
  const send = vi.fn(() =>
    response instanceof Error ? Promise.reject(response) : Promise.resolve(response),
  );

  const assertCsrfToken = vi.fn(() => {
    if (!csrfValid) {
      throw new Error('Token CSRF inválido.');
    }
  });

  const sessionCookies = {
    requireSession: vi.fn(() => Promise.resolve({ session: { emailVerified } })),
    assertCsrfToken,
  } as unknown as SessionCookieService;

  const forwarder = new CoreApiForwarder(sessionCookies, { send } as unknown as CoreApiClient);

  const reply = { status: vi.fn(), header: vi.fn() };

  reply.status.mockReturnValue(reply);

  return {
    assertCsrfToken,
    congregations: new CongregationsController(forwarder),
    organization: new OrganizationController(forwarder),
    reply: reply as unknown as FastifyReply,
    request: {} as FastifyRequest,
    send,
    sessionCookies,
  };
};

describe('CoreApiForwarder', () => {
  it('deve repassar status, Content-Type e corpo da Core API', async () => {
    const { organization, reply, request, send } = createFixture();

    await expect(organization.get(request, reply)).resolves.toEqual({ id: ID });

    expect(send).toHaveBeenCalledWith({ method: 'GET', path: 'organization' });

    expect(reply.status).toHaveBeenCalledWith(200);

    expect(reply.header).toHaveBeenCalledWith('Content-Type', 'application/json; charset=utf-8');
  });

  it('deve exigir sessão válida antes de chamar a Core API', async () => {
    const { organization, reply, request, send, sessionCookies } = createFixture();

    vi.mocked(sessionCookies.requireSession).mockRejectedValueOnce(new UnauthorizedException());

    await expect(organization.get(request, reply)).rejects.toBeInstanceOf(UnauthorizedException);

    expect(send).not.toHaveBeenCalled();
  });

  it('deve recusar com 403 a conta com e-mail não verificado', async () => {
    const { organization, reply, request, send } = createFixture({ emailVerified: false });

    await expect(organization.get(request, reply)).rejects.toThrow(
      'Confirme seu e-mail para acessar este recurso.',
    );

    expect(send).not.toHaveBeenCalled();
  });

  it('deve exigir CSRF somente nas operações que alteram estado', async () => {
    const { assertCsrfToken, organization, reply, request } = createFixture();

    await organization.get(request, reply);

    expect(assertCsrfToken).not.toHaveBeenCalled();

    await organization.update(undefined, request, reply);

    expect(assertCsrfToken).toHaveBeenCalledTimes(1);

    const rejected = createFixture({ csrfValid: false });

    await expect(rejected.organization.activate(request, reply)).rejects.toThrow('CSRF');

    expect(rejected.send).not.toHaveBeenCalled();
  });

  it.each([
    ['401 da credencial de serviço', { ...okResponse, status: 401 }, 'Bad Gateway'],
    ['falha interna', { ...okResponse, status: 500 }, 'Bad Gateway'],
    ['Core API indisponível', new CoreApiUnavailableError('timeout'), 'Service Unavailable'],
  ])('não deve repassar %s ao navegador', async (_caso, response, error) => {
    const { organization, reply, request } = createFixture({ response });

    const caught: unknown = await organization.get(request, reply).catch((e: unknown) => e);

    expect(caught).toMatchObject({ response: { error } });
  });

  it('deve propagar erros inesperados', async () => {
    const { organization, reply, request } = createFixture({ response: new Error('bug') });

    await expect(organization.get(request, reply)).rejects.toThrow('bug');
  });

  it('deve repassar os erros de negócio (4xx) da Core API', async () => {
    const problem = { status: 409, title: 'Conflito' };

    const { congregations, reply, request } = createFixture({
      response: { status: 409, contentType: 'application/problem+json', body: problem },
    });

    await expect(congregations.activate(ID, request, reply)).resolves.toEqual(problem);

    expect(reply.status).toHaveBeenCalledWith(409);
  });
});

describe('Rotas web de Organization e Congregation', () => {
  it('deve mapear cada rota da organização para a Core API', async () => {
    const { organization, reply, request, send } = createFixture();

    await organization.update({ version: 1 }, request, reply);

    await organization.activate(request, reply);

    await organization.deactivate(request, reply);

    expect(send.mock.calls).toEqual([
      [{ method: 'PATCH', path: 'organization', body: { version: 1 } }],
      [{ method: 'POST', path: 'organization/activate' }],
      [{ method: 'POST', path: 'organization/deactivate' }],
    ]);
  });

  it('deve mapear cada rota de congregações, repassando somente filtros conhecidos', async () => {
    const { congregations, reply, request, send } = createFixture();

    await congregations.list(
      { status: 'ACTIVE', limit: '5', cursor: ID, extra: 'x', page: ['1'] },
      request,
      reply,
    );

    await congregations.get(ID, request, reply);

    await congregations.register(undefined, request, reply);

    await congregations.update(ID, { version: 1 }, request, reply);

    await congregations.activate(ID, request, reply);

    await congregations.deactivate(ID, request, reply);

    expect(send.mock.calls).toEqual([
      [
        {
          method: 'GET',
          path: 'congregations',
          query: { status: 'ACTIVE', cursor: ID, limit: '5' },
        },
      ],
      [{ method: 'GET', path: `congregations/${ID}` }],
      [{ method: 'POST', path: 'congregations', body: {} }],
      [{ method: 'PATCH', path: `congregations/${ID}`, body: { version: 1 } }],
      [{ method: 'POST', path: `congregations/${ID}/activate` }],
      [{ method: 'POST', path: `congregations/${ID}/deactivate` }],
    ]);
  });

  it('deve responder 404 para IDs fora do formato UUID sem chamar a Core API', async () => {
    const { congregations, reply, request, send } = createFixture();

    expect(() => congregations.get('../organization', request, reply)).toThrow(
      'Registro não encontrado.',
    );

    expect(send).not.toHaveBeenCalled();
  });
});
