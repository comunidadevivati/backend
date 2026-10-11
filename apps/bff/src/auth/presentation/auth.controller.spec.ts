import { BadRequestException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthController } from './auth.controller.js';
import type { OidcClientService } from '../infrastructure/keycloak/oidc-client.service.js';
import type { AuthSession, SessionService } from '../infrastructure/session/session.service.js';
import type { ConfigService } from '@nestjs/config';
import type { FastifyReply, FastifyRequest } from 'fastify';

const oidcMock = vi.hoisted(() => ({
  authorizationCodeGrant: vi.fn(),
  buildAuthorizationUrl: vi.fn(() => new URL('https://auth.example.com/authorize?x=1')),
  calculatePKCECodeChallenge: vi.fn(() => Promise.resolve('challenge')),
  randomNonce: vi.fn(() => 'nonce'),
  randomPKCECodeVerifier: vi.fn(() => 'verifier'),
  randomState: vi.fn(() => 'state'),
}));

vi.mock('openid-client', () => oidcMock);

const configuration = { issuer: 'mock' };

const transactionCookies = {
  cv_oidc_state: 'signed-state',
  cv_oidc_nonce: 'signed-nonce',
  cv_oidc_verifier: 'signed-verifier',
};

const createFixture = (baseUrl = 'https://bff.example.com') => {
  const values: Record<string, string> = {
    BFF_BASE_URL: baseUrl,
    BFF_OIDC_CALLBACK_URL: `${baseUrl}/auth/callback`,
    WEB_BASE_URL: 'https://app.example.com',
  };

  const configService = {
    getOrThrow: (key: string) => values[key],
  } as unknown as ConfigService;

  const oidcClient = {
    getConfiguration: () => configuration,
  } as unknown as OidcClientService;

  const sessionService = {
    createSession: vi.fn(() => Promise.resolve('session-id')),
  };

  const reply = {
    setCookie: vi.fn(),
    clearCookie: vi.fn(),
    code: vi.fn(),
    redirect: vi.fn(),
  };

  reply.code.mockReturnValue(reply);

  const controller = new AuthController(
    oidcClient,
    configService,
    sessionService as unknown as SessionService,
  );

  return { controller, reply, sessionService };
};

const createRequest = (
  cookies: Record<string, string> = transactionCookies,
  url = '/auth/callback?code=abc&state=state',
  valid = true,
) =>
  ({
    url,
    cookies,
    unsignCookie: vi.fn((value: string) => ({
      valid,
      value: valid ? value.replace('signed-', '') : null,
    })),
  }) as unknown as FastifyRequest;

const defaultClaims = { sub: 'usuario-123' };

const mockTokens = (
  tokens: Record<string, unknown>,
  claims: Record<string, unknown> = defaultClaims,
) => {
  oidcMock.authorizationCodeGrant.mockResolvedValue({ ...tokens, claims: () => claims });
};

const asReply = (reply: unknown) => reply as FastifyReply;

describe('AuthController — login', () => {
  beforeEach(() => vi.clearAllMocks());

  it('deve gravar cookies de transação e redirecionar ao provedor', async () => {
    const { controller, reply } = createFixture();

    await controller.login(asReply(reply));

    expect(reply.setCookie).toHaveBeenCalledWith(
      'cv_oidc_verifier',
      'verifier',
      expect.objectContaining({ httpOnly: true, signed: true, secure: true, path: '/auth' }),
    );

    expect(oidcMock.buildAuthorizationUrl).toHaveBeenCalledWith(
      configuration,
      expect.objectContaining({
        redirect_uri: 'https://bff.example.com/auth/callback',
        state: 'state',
        nonce: 'nonce',
        code_challenge: 'challenge',
        code_challenge_method: 'S256',
      }),
    );

    expect(reply.code).toHaveBeenCalledWith(302);

    expect(reply.redirect).toHaveBeenCalledWith('https://auth.example.com/authorize?x=1');
  });

  it('deve emitir cookies não seguros em HTTP local', async () => {
    const { controller, reply } = createFixture('http://localhost:3001');

    await controller.login(asReply(reply));

    expect(reply.setCookie).toHaveBeenCalledWith(
      'cv_oidc_state',
      'state',
      expect.objectContaining({ secure: false }),
    );
  });
});

describe('AuthController — callback válido', () => {
  beforeEach(() => vi.clearAllMocks());

  it('deve criar a sessão, gravar o cookie e redirecionar ao frontend', async () => {
    const { controller, reply, sessionService } = createFixture();

    mockTokens({
      access_token: 'access',
      refresh_token: 'refresh',
      id_token: 'id',
      expires_in: 600,
    });

    await controller.callback(createRequest(), asReply(reply));

    expect(oidcMock.authorizationCodeGrant).toHaveBeenCalledWith(
      configuration,
      new URL('https://bff.example.com/auth/callback?code=abc&state=state'),
      {
        expectedState: 'state',
        expectedNonce: 'nonce',
        pkceCodeVerifier: 'verifier',
        idTokenExpected: true,
      },
    );

    expect(sessionService.createSession).toHaveBeenCalledWith(
      expect.objectContaining({
        subject: 'usuario-123',
        accessToken: 'access',
        refreshToken: 'refresh',
        idToken: 'id',
      }),
    );

    expect(reply.clearCookie).toHaveBeenCalledTimes(3);

    expect(reply.setCookie).toHaveBeenCalledWith(
      '__Host-comvivati-session',
      'session-id',
      expect.objectContaining({ httpOnly: true, secure: true, path: '/', maxAge: 1800 }),
    );

    expect(reply.redirect).toHaveBeenCalledWith('https://app.example.com');
  });
});

describe('AuthController — callback com tokens mínimos', () => {
  beforeEach(() => vi.clearAllMocks());

  it('deve omitir tokens opcionais e usar expiração padrão', async () => {
    const { controller, reply, sessionService } = createFixture();

    mockTokens({ access_token: 'access' });

    await controller.callback(createRequest(), asReply(reply));

    const [session] = sessionService.createSession.mock.calls[0] as unknown as [AuthSession];

    expect(session).not.toHaveProperty('refreshToken');

    expect(session).not.toHaveProperty('idToken');

    expect(session.accessTokenExpiresAt - session.createdAt).toBe(300);
  });
});

describe('AuthController — transação inválida', () => {
  beforeEach(() => vi.clearAllMocks());

  it('deve rejeitar quando os cookies de transação estão ausentes', async () => {
    const { controller, reply } = createFixture();

    await expect(controller.callback(createRequest({}), asReply(reply))).rejects.toThrow(
      BadRequestException,
    );

    expect(reply.clearCookie).toHaveBeenCalledTimes(3);
  });

  it('deve rejeitar cookies com assinatura inválida', async () => {
    const { controller, reply } = createFixture();

    const request = createRequest(transactionCookies, undefined, false);

    await expect(controller.callback(request, asReply(reply))).rejects.toThrow(
      'Transação de autenticação inválida ou expirada.',
    );
  });

  it('deve rejeitar callbacks em caminho inesperado', async () => {
    const { controller, reply } = createFixture();

    const request = createRequest(transactionCookies, '/outro/caminho?code=abc');

    await expect(controller.callback(request, asReply(reply))).rejects.toThrow(
      'Callback OIDC inválido.',
    );

    expect(oidcMock.authorizationCodeGrant).not.toHaveBeenCalled();
  });

  it('deve rejeitar callbacks com origem inesperada', async () => {
    const { controller, reply } = createFixture();

    const request = createRequest(transactionCookies, 'https://evil.example.com/auth/callback');

    await expect(controller.callback(request, asReply(reply))).rejects.toThrow(
      'Callback OIDC inválido.',
    );
  });
});

describe('AuthController — resposta inválida do provedor', () => {
  beforeEach(() => vi.clearAllMocks());

  it('deve rejeitar respostas sem subject', async () => {
    const { controller, reply, sessionService } = createFixture();

    mockTokens({ access_token: 'access' }, {});

    await expect(controller.callback(createRequest(), asReply(reply))).rejects.toThrow(
      'Resposta de autenticação inválida.',
    );

    expect(sessionService.createSession).not.toHaveBeenCalled();
  });

  it('deve rejeitar respostas sem access token', async () => {
    const { controller, reply } = createFixture();

    mockTokens({});

    await expect(controller.callback(createRequest(), asReply(reply))).rejects.toThrow(
      'Resposta de autenticação inválida.',
    );
  });
});
