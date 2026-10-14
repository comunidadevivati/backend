import { describe, expect, it, vi } from 'vitest';
import { AuthMeController } from './auth-me.controller.js';
import type { AuthSession, SessionService } from '../infrastructure/session/session.service.js';
import type { ConfigService } from '@nestjs/config';
import type { FastifyReply, FastifyRequest } from 'fastify';

const authenticatedSession: AuthSession = {
  subject: 'usuario-123',
  email: 'usuario@exemplo.com',
  name: 'Usuário Exemplo',
  csrfToken: 'csrf-token-teste',
  accessToken: 'access-token-teste',
  accessTokenExpiresAt: 1_800,
  createdAt: 0,
};

const createFixture = (
  cookie?: string,
  valid = true,
  session: AuthSession | null = null,
  csrfToken?: string,
) => {
  const getSession = vi.fn(() => Promise.resolve(session));

  const deleteSession = vi.fn(() => Promise.resolve());

  const sessionService = {
    getSession,
    deleteSession,
  } as unknown as SessionService;

  const configService = {
    getOrThrow: vi.fn(() => 'http://localhost:3000'),
  } as unknown as ConfigService;

  const request = {
    cookies: cookie ? { comvivati_session: cookie } : {},
    headers: csrfToken ? { 'x-csrf-token': csrfToken } : {},
    unsignCookie: vi.fn(() => ({
      valid,
      value: valid ? 'session-id' : null,
    })),
  } as unknown as FastifyRequest;

  const reply = {
    clearCookie: vi.fn(),
  } as unknown as FastifyReply;

  const controller = new AuthMeController(sessionService, configService);

  return { controller, deleteSession, reply, request };
};

describe('AuthMeController — autenticação', () => {
  it('deve retornar a sessão pública do usuário autenticado', async () => {
    const { controller, request } = createFixture('signed-cookie', true, authenticatedSession);

    await expect(controller.me(request)).resolves.toEqual({
      authenticated: true,
      csrfToken: 'csrf-token-teste',
      user: {
        subject: 'usuario-123',
        email: 'usuario@exemplo.com',
        name: 'Usuário Exemplo',
      },
    });
  });

  it('deve omitir dados opcionais ausentes', async () => {
    const { controller, request } = createFixture('signed-cookie', true, {
      subject: 'usuario-123',
      csrfToken: 'csrf-token-teste',
      accessToken: 'access-token-teste',
      accessTokenExpiresAt: 1_800,
      createdAt: 0,
    });

    await expect(controller.me(request)).resolves.toEqual({
      authenticated: true,
      csrfToken: 'csrf-token-teste',
      user: {
        subject: 'usuario-123',
      },
    });
  });
});

describe('AuthMeController — validação da sessão', () => {
  it('deve rejeitar requisições sem cookie', async () => {
    const { controller, request } = createFixture();

    await expect(controller.me(request)).rejects.toThrow('Sessão não encontrada.');
  });

  it('deve rejeitar cookies com assinatura inválida', async () => {
    const { controller, request } = createFixture('cookie-invalido', false);

    await expect(controller.me(request)).rejects.toThrow('Sessão inválida.');
  });

  it('deve rejeitar sessões inexistentes ou expiradas', async () => {
    const { controller, request } = createFixture('signed-cookie');

    await expect(controller.me(request)).rejects.toThrow('Sessão expirada ou inválida.');
  });

  it('deve rejeitar sessões anteriores sem proteção CSRF', async () => {
    const { controller, request } = createFixture('signed-cookie', true, {
      ...authenticatedSession,
      csrfToken: undefined,
    } as unknown as AuthSession);

    await expect(controller.me(request)).rejects.toThrow('Sessão expirada ou inválida.');
  });
});

describe('AuthMeController — logout', () => {
  it('deve revogar a sessão e remover o cookie', async () => {
    const { controller, deleteSession, reply, request } = createFixture(
      'signed-cookie',
      true,
      authenticatedSession,
      'csrf-token-teste',
    );

    await controller.logout(request, reply);

    expect(deleteSession).toHaveBeenCalledWith('session-id');

    expect(reply.clearCookie).toHaveBeenCalledWith('comvivati_session', { path: '/' });
  });

  it('deve rejeitar logout sem token CSRF', async () => {
    const { controller, deleteSession, reply, request } = createFixture(
      'signed-cookie',
      true,
      authenticatedSession,
    );

    await expect(controller.logout(request, reply)).rejects.toThrow('Token CSRF inválido.');

    expect(deleteSession).not.toHaveBeenCalled();
  });

  it('deve rejeitar token CSRF com tamanho diferente', async () => {
    const { controller, reply, request } = createFixture(
      'signed-cookie',
      true,
      authenticatedSession,
      'invalido',
    );

    await expect(controller.logout(request, reply)).rejects.toThrow('Token CSRF inválido.');
  });

  it('deve rejeitar token CSRF incorreto com o mesmo tamanho', async () => {
    const { controller, reply, request } = createFixture(
      'signed-cookie',
      true,
      authenticatedSession,
      'csrf-token-falso',
    );

    await expect(controller.logout(request, reply)).rejects.toThrow('Token CSRF inválido.');
  });
});
