import { BadRequestException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { AuthController } from './auth.controller.js';
import type { OidcClientService } from '../infrastructure/keycloak/oidc-client.service.js';
import type { SessionService } from '../infrastructure/session/session.service.js';
import type { ConfigService } from '@nestjs/config';
import type { FastifyReply, FastifyRequest } from 'fastify';

const oidcMocks = vi.hoisted(() => ({
  buildAuthorizationUrl: vi.fn(),
  calculatePKCECodeChallenge: vi.fn(),
}));

vi.mock('openid-client', () => ({
  authorizationCodeGrant: vi.fn(),
  buildAuthorizationUrl: oidcMocks.buildAuthorizationUrl,
  calculatePKCECodeChallenge: oidcMocks.calculatePKCECodeChallenge,
  randomNonce: () => 'nonce-teste',
  randomPKCECodeVerifier: () => 'verifier-teste',
  randomState: () => 'state-teste',
}));

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

  const sessions = {
    createSession: vi.fn(),
  } as unknown as SessionService;

  const reply = {
    setCookie: vi.fn(),
    clearCookie: vi.fn(),
    redirect: vi.fn(),
    code: vi.fn(),
  };

  reply.code.mockReturnValue(reply);

  const controller = new AuthController(oidc, config, sessions);

  return { controller, reply };
};

describe('AuthController — login', () => {
  it('deve iniciar o Authorization Code Flow com PKCE S256', async () => {
    const { controller, reply } = createFixture();

    oidcMocks.calculatePKCECodeChallenge.mockResolvedValue('challenge-teste');

    oidcMocks.buildAuthorizationUrl.mockReturnValue(
      new URL('http://localhost:8080/realms/comunidade-viva/protocol/openid-connect/auth'),
    );

    await controller.login(reply as unknown as FastifyReply);

    expect(oidcMocks.buildAuthorizationUrl).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        state: 'state-teste',
        nonce: 'nonce-teste',
        code_challenge: 'challenge-teste',
        code_challenge_method: 'S256',
      }),
    );

    expect(reply.setCookie).toHaveBeenCalledTimes(3);

    expect(reply.code).toHaveBeenCalledWith(302);

    expect(reply.redirect).toHaveBeenCalledOnce();
  });
});

describe('AuthController — callback', () => {
  it('deve rejeitar uma transação sem cookies OIDC', async () => {
    const { controller, reply } = createFixture();

    const request = {
      url: '/auth/callback?code=teste',
      cookies: {},
      unsignCookie: vi.fn(),
    } as unknown as FastifyRequest;

    await expect(controller.callback(request, reply as unknown as FastifyReply)).rejects.toThrow(
      BadRequestException,
    );

    expect(reply.clearCookie).toHaveBeenCalledTimes(3);

    expect(reply.setCookie).not.toHaveBeenCalled();
  });
});
