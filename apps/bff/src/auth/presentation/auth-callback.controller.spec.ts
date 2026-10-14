import { BadRequestException } from '@nestjs/common';
import { authorizationCodeGrant } from 'openid-client';
import { describe, expect, it, vi } from 'vitest';
import { AuthController } from './auth.controller.js';
import type { OidcClientService } from '../infrastructure/keycloak/oidc-client.service.js';
import type { SessionService } from '../infrastructure/session/session.service.js';
import type { ConfigService } from '@nestjs/config';
import type { FastifyReply, FastifyRequest } from 'fastify';

vi.mock('openid-client', () => ({
  authorizationCodeGrant: vi.fn(),
}));

const grantMock = vi.mocked(authorizationCodeGrant);

const createFixture = () => {
  const settings: Record<string, string> = {
    BFF_BASE_URL: 'http://localhost:3000',
    BFF_OIDC_CALLBACK_URL: 'http://localhost:3000/auth/callback',
    WEB_BASE_URL: 'http://localhost:5173',
  };

  const config = {
    getOrThrow: (key: string) => settings[key],
  } as ConfigService;

  const oidc = {
    getConfiguration: vi.fn(() => ({})),
  } as unknown as OidcClientService;

  const createSession = vi.fn(() => Promise.resolve('session-id'));

  const sessions = {
    createSession,
  } as unknown as SessionService;

  const request = {
    url: '/auth/callback?code=codigo-teste&state=state-teste',
    cookies: {
      cv_oidc_state: 'signed-state',
      cv_oidc_nonce: 'signed-nonce',
      cv_oidc_verifier: 'signed-verifier',
    },
    unsignCookie: vi.fn((value: string) => ({
      valid: true,
      value: value.replace('signed-', ''),
    })),
  } as unknown as FastifyRequest;

  const reply = {
    clearCookie: vi.fn(),
    setCookie: vi.fn(),
    code: vi.fn(),
    redirect: vi.fn(),
  };

  reply.code.mockReturnValue(reply);

  return {
    controller: new AuthController(oidc, config, sessions),
    request,
    reply,
    createSession,
  };
};

describe('AuthController — callback autorizado', () => {
  it('deve criar a sessão e redirecionar ao React', async () => {
    const fixture = createFixture();

    grantMock.mockResolvedValueOnce({
      claims: () => ({ sub: 'usuario-123' }),
      access_token: 'access-token-teste',
      refresh_token: 'refresh-token-teste',
      expires_in: 300,
    } as unknown as Awaited<ReturnType<typeof authorizationCodeGrant>>);

    await fixture.controller.callback(fixture.request, fixture.reply as unknown as FastifyReply);

    expect(fixture.createSession).toHaveBeenCalledOnce();

    expect(fixture.reply.setCookie).toHaveBeenCalledWith(
      'comvivati_session',
      'session-id',
      expect.objectContaining({ httpOnly: true, signed: true }),
    );

    expect(fixture.reply.code).toHaveBeenCalledWith(302);

    expect(fixture.reply.redirect).toHaveBeenCalledWith('http://localhost:5173/dashboard');
  });
});

describe('AuthController — resposta inválida', () => {
  it('deve rejeitar tokens sem identidade', async () => {
    const fixture = createFixture();

    grantMock.mockResolvedValueOnce({
      claims: () => {},
      access_token: 'access-token-teste',
    } as Awaited<ReturnType<typeof authorizationCodeGrant>>);

    await expect(
      fixture.controller.callback(fixture.request, fixture.reply as unknown as FastifyReply),
    ).rejects.toThrow(BadRequestException);

    expect(fixture.createSession).not.toHaveBeenCalled();
  });

  it('deve rejeitar uma falha na validação OIDC', async () => {
    const fixture = createFixture();

    grantMock.mockRejectedValueOnce(new Error('Falha na validação do state ou nonce'));

    await expect(
      fixture.controller.callback(fixture.request, fixture.reply as unknown as FastifyReply),
    ).rejects.toThrow('Falha na validação do state ou nonce');

    expect(fixture.createSession).not.toHaveBeenCalled();
  });
});

describe('AuthController — validações adicionais do callback', () => {
  it('deve rejeitar uma URL de callback diferente', async () => {
    const fixture = createFixture();

    Object.defineProperty(fixture.request, 'url', {
      value: '/auth/invalid?code=teste',
      configurable: true,
    });

    await expect(
      fixture.controller.callback(fixture.request, fixture.reply as unknown as FastifyReply),
    ).rejects.toThrow('Callback OIDC inválido');

    expect(fixture.createSession).not.toHaveBeenCalled();
  });

  it('deve rejeitar cookies com assinatura inválida', async () => {
    const fixture = createFixture();

    vi.mocked(fixture.request.unsignCookie).mockImplementation(() => ({
      valid: false,
      value: null,
      renew: false,
    }));

    await expect(
      fixture.controller.callback(fixture.request, fixture.reply as unknown as FastifyReply),
    ).rejects.toThrow('Transação de autenticação inválida ou expirada.');

    expect(fixture.createSession).not.toHaveBeenCalled();
  });
});

describe('AuthController — tokens opcionais', () => {
  it('deve criar sessão com ID token e expiração padrão', async () => {
    const fixture = createFixture();

    grantMock.mockResolvedValueOnce({
      claims: () => ({
        sub: 'usuario-456',
        email: 'usuario@exemplo.com',
        name: 'Usuário Exemplo',
      }),
      access_token: 'access-token-teste',
      id_token: 'id-token-teste',
    } as unknown as Awaited<ReturnType<typeof authorizationCodeGrant>>);

    await fixture.controller.callback(fixture.request, fixture.reply as unknown as FastifyReply);

    expect(fixture.createSession).toHaveBeenCalledWith(
      expect.objectContaining({
        subject: 'usuario-456',
        email: 'usuario@exemplo.com',
        name: 'Usuário Exemplo',
        csrfToken: expect.stringMatching(/^[A-Za-z0-9_-]{43}$/u),
        idToken: 'id-token-teste',
        accessToken: 'access-token-teste',
      }),
    );

    const now = Math.floor(Date.now() / 1000);

    expect(fixture.createSession).toHaveBeenCalledWith(
      expect.objectContaining({
        createdAt: now,
        accessTokenExpiresAt: now + 300,
      }),
    );

    expect(fixture.createSession).toHaveBeenCalledWith(
      expect.not.objectContaining({
        refreshToken: expect.any(String),
      }),
    );
  });
});
