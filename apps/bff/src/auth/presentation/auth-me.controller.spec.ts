import { describe, expect, it, vi } from 'vitest';
import { AuthMeController } from './auth-me.controller.js';
import type { SessionService } from '../infrastructure/session/session.service.js';
import type { ConfigService } from '@nestjs/config';
import type { FastifyRequest } from 'fastify';

const createFixture = (
  cookie?: string,
  valid = true,
  session: { subject: string } | null = null,
) => {
  const sessionService = {
    getSession: vi.fn(() => Promise.resolve(session)),
  } as unknown as SessionService;

  const configService = {
    getOrThrow: vi.fn(() => 'http://localhost:3000'),
  } as unknown as ConfigService;

  const request = {
    cookies: cookie ? { comvivati_session: cookie } : {},
    unsignCookie: vi.fn(() => ({
      valid,
      value: valid ? 'session-id' : null,
    })),
  } as unknown as FastifyRequest;

  const controller = new AuthMeController(sessionService, configService);

  return { controller, request };
};

describe('AuthMeController — autenticação', () => {
  it('deve retornar o usuário autenticado', async () => {
    const { controller, request } = createFixture('signed-cookie', true, {
      subject: 'usuario-123',
    });

    await expect(controller.me(request)).resolves.toEqual({
      authenticated: true,
      subject: 'usuario-123',
    });
  });

  it('deve rejeitar requisições sem cookie', async () => {
    const { controller, request } = createFixture();

    await expect(controller.me(request)).rejects.toThrow('Sessão não encontrada.');
  });

  it('deve rejeitar cookies com assinatura inválida', async () => {
    const { controller, request } = createFixture('cookie-invalido', false);

    await expect(controller.me(request)).rejects.toThrow('Sessão inválida.');
  });
});

describe('AuthMeController — sessão', () => {
  it('deve rejeitar sessões inexistentes ou expiradas', async () => {
    const { controller, request } = createFixture('signed-cookie');

    await expect(controller.me(request)).rejects.toThrow('Sessão expirada ou inválida.');
  });
});
