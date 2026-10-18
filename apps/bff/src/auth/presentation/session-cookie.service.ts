import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { getSessionCookieName } from '../domain/constants/session-cookie.constants.js';
import {
  SESSION_ABSOLUTE_TIMEOUT_SECONDS,
  SessionService,
} from '../infrastructure/session/session.service.js';
import type { LoginResult } from '../application/login.use-case.js';
import type { FastifyReply, FastifyRequest } from 'fastify';

export interface AuthenticatedUser {
  authenticated: true;
  csrfToken: string;
  user: {
    subject: string;
    email: string;
    name: string;
  };
}

// Resposta das operações que abrem sessão: a sessão pública acrescida da mensagem da operação.
export interface StartedSession extends AuthenticatedUser {
  message: string;
}

// Cookie de sessão compartilhado pelo login, cadastro e redefinição de senha.
@Injectable()
export class SessionCookieService {
  constructor(
    @Inject(SessionService)
    private readonly sessionService: SessionService,
    @Inject(ConfigService)
    private readonly configService: ConfigService,
  ) {}

  // Entrega ao navegador uma sessão recém-criada.
  async startSession(
    request: FastifyRequest,
    reply: FastifyReply,
    session: LoginResult,
    message: string,
  ): Promise<StartedSession> {
    const cookieName = this.getCookieName();

    // Rotação: uma sessão anterior no mesmo navegador é revogada ao autenticar novamente.
    const previousToken = this.readSessionToken(request, cookieName);

    if (previousToken) {
      await this.sessionService.deleteSession(previousToken);
    }

    reply.setCookie(cookieName, session.sessionToken, {
      httpOnly: true,
      signed: true,
      secure: this.isHttps(),
      sameSite: 'lax',
      path: '/',
      maxAge: SESSION_ABSOLUTE_TIMEOUT_SECONDS,
    });

    return {
      authenticated: true,
      message,
      csrfToken: session.csrfToken,
      user: {
        subject: session.user.id,
        email: session.user.email,
        name: session.user.name,
      },
    };
  }

  readSessionToken(request: FastifyRequest, cookieName: string): string | null {
    const cookie = request.cookies[cookieName];

    if (!cookie) {
      return null;
    }

    const unsigned = request.unsignCookie(cookie);

    return unsigned.valid && unsigned.value ? unsigned.value : null;
  }

  getCookieName(): string {
    return getSessionCookieName(this.isHttps());
  }

  private isHttps(): boolean {
    return new URL(this.configService.getOrThrow<string>('BFF_BASE_URL')).protocol === 'https:';
  }
}
