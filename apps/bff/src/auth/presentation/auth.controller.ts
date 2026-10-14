import { randomBytes } from 'node:crypto';
import { BadRequestException, Controller, Get, Inject, Req, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  authorizationCodeGrant,
  buildAuthorizationUrl,
  calculatePKCECodeChallenge,
  randomNonce,
  randomPKCECodeVerifier,
  randomState,
} from 'openid-client';
import { getSessionCookieName } from '../domain/constants/session-cookie.constants.js';
import { OidcClientService } from '../infrastructure/keycloak/oidc-client.service.js';
import { SessionService } from '../infrastructure/session/session.service.js';
import type { FastifyReply, FastifyRequest } from 'fastify';

const transactionCookies = ['cv_oidc_state', 'cv_oidc_nonce', 'cv_oidc_verifier'] as const;

@Controller('auth')
export class AuthController {
  constructor(
    @Inject(OidcClientService)
    private readonly oidcClient: OidcClientService,
    @Inject(ConfigService)
    private readonly configService: ConfigService,
    @Inject(SessionService)
    private readonly sessionService: SessionService,
  ) {}

  @Get('login')
  async login(@Res() reply: FastifyReply): Promise<void> {
    const configuration = this.oidcClient.getConfiguration();

    const redirectUri = this.configService.getOrThrow<string>('BFF_OIDC_CALLBACK_URL');

    const codeVerifier = randomPKCECodeVerifier();

    const codeChallenge = await calculatePKCECodeChallenge(codeVerifier);

    const state = randomState();

    const nonce = randomNonce();

    const options = {
      httpOnly: true,
      signed: true,
      secure: this.isHttps(),
      sameSite: 'lax' as const,
      path: '/auth',
      maxAge: 300,
    };

    reply.setCookie('cv_oidc_state', state, options);

    reply.setCookie('cv_oidc_nonce', nonce, options);

    reply.setCookie('cv_oidc_verifier', codeVerifier, options);

    const authorizationUrl = buildAuthorizationUrl(configuration, {
      redirect_uri: redirectUri,
      scope: 'openid profile email',
      response_type: 'code',
      state,
      nonce,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
    });

    reply.code(302).redirect(authorizationUrl.href);
  }

  @Get('callback')
  async callback(@Req() request: FastifyRequest, @Res() reply: FastifyReply): Promise<void> {
    const state = this.readSignedCookie(request, 'cv_oidc_state');

    const nonce = this.readSignedCookie(request, 'cv_oidc_nonce');

    const codeVerifier = this.readSignedCookie(request, 'cv_oidc_verifier');

    this.clearTransactionCookies(reply);

    if (!state || !nonce || !codeVerifier) {
      throw new BadRequestException('Transação de autenticação inválida ou expirada.');
    }

    const callbackUrl = this.validateCallbackUrl(request);

    const sessionId = await this.createAuthenticatedSession(
      callbackUrl,
      state,
      nonce,
      codeVerifier,
    );

    reply.setCookie(getSessionCookieName(this.isHttps()), sessionId, {
      httpOnly: true,
      signed: true,
      secure: this.isHttps(),
      sameSite: 'lax',
      path: '/',
      maxAge: 1800,
    });

    const webUrl = this.configService.getOrThrow<string>('WEB_BASE_URL');

    const dashboardUrl = new URL('/dashboard', webUrl);

    reply.code(302).redirect(dashboardUrl.href);
  }

  private validateCallbackUrl(request: FastifyRequest): URL {
    const baseUrl = this.configService.getOrThrow<string>('BFF_BASE_URL');

    const expectedUrl = this.configService.getOrThrow<string>('BFF_OIDC_CALLBACK_URL');

    const callbackUrl = new URL(request.url, baseUrl);

    if (
      callbackUrl.origin !== new URL(expectedUrl).origin ||
      callbackUrl.pathname !== new URL(expectedUrl).pathname
    ) {
      throw new BadRequestException('Callback OIDC inválido.');
    }

    return callbackUrl;
  }

  private async createAuthenticatedSession(
    callbackUrl: URL,
    state: string,
    nonce: string,
    codeVerifier: string,
  ): Promise<string> {
    const tokens = await authorizationCodeGrant(this.oidcClient.getConfiguration(), callbackUrl, {
      expectedState: state,
      expectedNonce: nonce,
      pkceCodeVerifier: codeVerifier,
      idTokenExpected: true,
    });

    const claims = tokens.claims();

    if (!claims?.sub || !tokens.access_token) {
      throw new BadRequestException('Resposta de autenticação inválida.');
    }

    const now = Math.floor(Date.now() / 1000);

    return this.sessionService.createSession({
      subject: claims.sub,
      ...(typeof claims['email'] === 'string' ? { email: claims['email'] } : {}),
      ...(typeof claims['name'] === 'string' ? { name: claims['name'] } : {}),
      csrfToken: randomBytes(32).toString('base64url'),
      accessToken: tokens.access_token,
      ...(tokens.refresh_token ? { refreshToken: tokens.refresh_token } : {}),
      ...(tokens.id_token ? { idToken: tokens.id_token } : {}),
      accessTokenExpiresAt: now + (tokens.expires_in ?? 300),
      createdAt: now,
    });
  }

  private readSignedCookie(request: FastifyRequest, name: string): string | null {
    const cookie = request.cookies[name];

    if (!cookie) {
      return null;
    }

    const result = request.unsignCookie(cookie);

    return result.valid ? result.value : null;
  }

  private clearTransactionCookies(reply: FastifyReply): void {
    for (const name of transactionCookies) {
      reply.clearCookie(name, { path: '/auth' });
    }
  }

  private isHttps(): boolean {
    const baseUrl = this.configService.getOrThrow<string>('BFF_BASE_URL');

    return new URL(baseUrl).protocol === 'https:';
  }
}
