import { timingSafeEqual } from 'node:crypto';
import { ForbiddenException, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { getSessionCookieName } from '../domain/constants/session-cookie.constants.js';
import {
  SESSION_ABSOLUTE_TIMEOUT_SECONDS,
  SessionService,
  type AuthSession,
} from '../infrastructure/session/session.service.js';
import type { LoginResult } from '../application/login.use-case.js';
import type { FastifyReply, FastifyRequest } from 'fastify';

interface AuthenticatedUser {
  authenticated: true;
  csrfToken: string;
  user: {
    subject: string;
    email: string;
    name: string;
    emailVerified: boolean;
  };
}

// Resposta de GET /auth/me: acrescenta se a conta é de um membro, o que libera os menus do painel.
export interface CurrentSession extends AuthenticatedUser {
  user: AuthenticatedUser['user'] & { isMember: boolean };
}

// Resposta das operações que abrem sessão: a sessão pública acrescida da mensagem da operação.
export interface StartedSession extends AuthenticatedUser {
  message: string;
}

const matchesToken = (expected: string, received: string): boolean => {
  const expectedBuffer = Buffer.from(expected);

  const receivedBuffer = Buffer.from(received);

  return (
    expectedBuffer.length === receivedBuffer.length &&
    timingSafeEqual(expectedBuffer, receivedBuffer)
  );
};

export interface SessionContext {
  cookieName: string;
  sessionToken: string;
  session: AuthSession;
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
        emailVerified: session.user.emailVerified,
      },
    };
  }

  // Sessão válida do cookie da requisição; responde 401 quando ausente, inválida ou expirada.
  async requireSession(request: FastifyRequest): Promise<SessionContext> {
    const cookieName = this.getCookieName();

    if (!request.cookies[cookieName]) {
      throw new UnauthorizedException('Sessão não encontrada.');
    }

    const sessionToken = this.readSessionToken(request, cookieName);

    if (!sessionToken) {
      throw new UnauthorizedException('Sessão inválida.');
    }

    const session = await this.sessionService.getSession(sessionToken);

    if (!session) {
      throw new UnauthorizedException('Sessão expirada ou inválida.');
    }

    return { cookieName, sessionToken, session };
  }

  // Operações que alteram estado exigem o header X-CSRF-Token igual ao da sessão.
  assertCsrfToken(request: FastifyRequest, session: AuthSession): void {
    const received = request.headers['x-csrf-token'];

    if (typeof received !== 'string' || !matchesToken(session.csrfToken, received)) {
      throw new ForbiddenException('Token CSRF inválido.');
    }
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
