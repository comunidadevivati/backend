import { UnauthorizedException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { UsersController } from './users.controller.js';
import type { UserManagementUseCases } from '../application/user-management.use-cases.js';
import type { SessionCookieService } from './session-cookie.service.js';
import type { FastifyRequest } from 'fastify';

const ID = '01a14f8e-a000-7000-8000-000000000001';

const OPERATOR_ID = '01a14f8e-a000-7000-8000-000000000099';

const account = { id: ID, status: 'ACTIVE' };

const validUser = {
  name: 'Paula Ribeiro',
  phone: '67991112233',
  email: 'Paula@Exemplo.com',
  password: 'Diversos@@2026',
};

const createFixture = ({ emailVerified = true } = {}) => {
  const users = {
    list: vi.fn(() => Promise.resolve({ items: [], nextCursor: null })),
    get: vi.fn(() => Promise.resolve<typeof account | null>(account)),
    create: vi.fn(() => Promise.resolve({ status: 'created', account })),
    update: vi.fn(() => Promise.resolve({ status: 'updated', account, emailChanged: false })),
    changeStatus: vi.fn(() => Promise.resolve({ status: 'changed', account })),
    delete: vi.fn(() => Promise.resolve('deleted')),
  };

  const assertCsrfToken = vi.fn();

  const sessionCookies = {
    requireSession: vi.fn(() =>
      Promise.resolve({ session: { userId: OPERATOR_ID, emailVerified } }),
    ),
    assertCsrfToken,
  };

  return {
    assertCsrfToken,
    controller: new UsersController(
      users as unknown as UserManagementUseCases,
      sessionCookies as unknown as SessionCookieService,
    ),
    request: {} as FastifyRequest,
    sessionCookies,
    users,
  };
};

const errorOf = async (promise: Promise<unknown>) => {
  const error: unknown = await promise.catch((caught: unknown) => caught);

  return {
    status: (error as { getStatus: () => number }).getStatus(),
    response: (error as { getResponse: () => unknown }).getResponse(),
  };
};

describe('UsersController', () => {
  it('deve listar com filtros padrão e consultar por ID sem exigir CSRF', async () => {
    const { assertCsrfToken, controller, request, users } = createFixture();

    await controller.list({ search: '  ' }, request);

    expect(users.list).toHaveBeenCalledWith({
      status: null,
      emailVerified: null,
      search: null,
      cursor: null,
      limit: 20,
    });

    await controller.list({ status: 'ACTIVE', emailVerified: 'false' }, request);

    expect(users.list).toHaveBeenLastCalledWith(
      expect.objectContaining({ status: 'ACTIVE', emailVerified: false }),
    );

    await controller.list({ emailVerified: 'true' }, request);

    expect(users.list).toHaveBeenLastCalledWith(expect.objectContaining({ emailVerified: true }));

    await expect(controller.get(ID, request)).resolves.toEqual(account);

    expect(assertCsrfToken).not.toHaveBeenCalled();
  });

  it('deve cadastrar com as regras do cadastro público, exigindo CSRF', async () => {
    const { assertCsrfToken, controller, request, users } = createFixture();

    await expect(controller.create(validUser, request)).resolves.toEqual(account);

    expect(users.create).toHaveBeenCalledWith({ ...validUser, email: 'paula@exemplo.com' });

    expect(assertCsrfToken).toHaveBeenCalledTimes(1);

    await expect(
      errorOf(controller.create({ ...validUser, password: 'fraca' }, request)),
    ).resolves.toMatchObject({ status: 400, response: { fields: ['password'] } });
  });

  it('deve alterar, suspender, reativar e excluir repassando quem opera', async () => {
    const { controller, request, users } = createFixture();

    await controller.update(ID, { name: 'Paula Souza', phone: '6732221100' }, request);

    expect(users.update).toHaveBeenCalledWith(ID, { name: 'Paula Souza', phone: '6732221100' });

    await controller.suspend(ID, request);

    await controller.reactivate(ID, request);

    await controller.delete(ID, request);

    expect(users.changeStatus.mock.calls).toEqual([
      [OPERATOR_ID, ID, 'SUSPENDED'],
      [OPERATOR_ID, ID, 'ACTIVE'],
    ]);

    expect(users.delete).toHaveBeenCalledWith(OPERATOR_ID, ID);
  });

  it.each([
    ['e-mail já cadastrado no cadastro', 'create', { status: 'email_taken' }, 409],
    ['inexistente na alteração', 'update', { status: 'not_found' }, 404],
    ['e-mail já cadastrado na alteração', 'update', { status: 'email_taken' }, 409],
    ['a própria conta na suspensão', 'changeStatus', { status: 'self' }, 409],
    ['inexistente na suspensão', 'changeStatus', { status: 'not_found' }, 404],
    ['a própria conta na exclusão', 'delete', 'self', 409],
    ['inexistente na exclusão', 'delete', 'not_found', 404],
    ['verificada na exclusão', 'delete', 'verified', 409],
  ] as const)('deve recusar conta %s', async (_caso, method, result, status) => {
    const { controller, request, users } = createFixture();

    users[method].mockResolvedValueOnce(result as never);

    const calls = {
      create: () => controller.create(validUser, request),
      update: () => controller.update(ID, {}, request),
      changeStatus: () => controller.suspend(ID, request),
      delete: () => controller.delete(ID, request),
    };

    await expect(errorOf(calls[method]())).resolves.toMatchObject({ status });
  });

  it('deve responder 404 para ID inválido ou conta inexistente', async () => {
    const { controller, request, users } = createFixture();

    await expect(errorOf(controller.get('../x', request))).resolves.toMatchObject({ status: 404 });

    users.get.mockResolvedValueOnce(null);

    await expect(errorOf(controller.get(ID, request))).resolves.toMatchObject({ status: 404 });
  });

  it('deve exigir sessão e e-mail verificado', async () => {
    const { controller, request, sessionCookies, users } = createFixture({ emailVerified: false });

    await expect(errorOf(controller.list({}, request))).resolves.toMatchObject({ status: 403 });

    sessionCookies.requireSession.mockRejectedValueOnce(new UnauthorizedException());

    await expect(controller.list({}, request)).rejects.toBeInstanceOf(UnauthorizedException);

    expect(users.list).not.toHaveBeenCalled();
  });
});
