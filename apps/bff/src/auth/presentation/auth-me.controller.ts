import { timingSafeEqual } from 'node:crypto';
import {
  Controller,
  ForbiddenException,
  Get,
  Header,
  HttpCode,
  Inject,
  Post,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { getSessionCookieName } from '../domain/constants/session-cookie.constants.js';
import { SessionService, type AuthSession } from '../infrastructure/session/session.service.js';
import type { FastifyReply, FastifyRequest } from 'fastify';

interface AuthenticatedUser {
  authenticated: true;
  csrfToken: string;
  user: {
    subject: string;
    email?: string;
    name?: string;
  };
}

interface SessionContext {
  cookieName: string;
  sessionId: string;
  session: AuthSession;
}

@Controller('auth')
export class AuthMeController {
  constructor(
    @Inject(SessionService)
    private readonly sessionService: SessionService,
    @Inject(ConfigService)
    private readonly configService: ConfigService,
  ) {}

  @Get('me')
  @Header('Cache-Control', 'no-store')
  async me(@Req() request: FastifyRequest): Promise<AuthenticatedUser> {
    const { session } = await this.getSessionContext(request);

    return {
      authenticated: true,
      csrfToken: session.csrfToken,
      user: {
        subject: session.subject,
        ...(session.email ? { email: session.email } : {}),
        ...(session.name ? { name: session.name } : {}),
      },
    };
  }

  @Post('logout')
  @HttpCode(204)
  @Header('Cache-Control', 'no-store')
  async logout(
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<void> {
    const { cookieName, sessionId, session } = await this.getSessionContext(request);

    const csrfToken = request.headers['x-csrf-token'];

    if (typeof csrfToken !== 'string' || !this.matchesCsrfToken(session.csrfToken, csrfToken)) {
      throw new ForbiddenException('Token CSRF inválido.');
    }

    await this.sessionService.deleteSession(sessionId);

    reply.clearCookie(cookieName, { path: '/' });
  }

  private async getSessionContext(request: FastifyRequest): Promise<SessionContext> {
    const baseUrl = this.configService.getOrThrow<string>('BFF_BASE_URL');

    const secure = new URL(baseUrl).protocol === 'https:';

    const cookieName = getSessionCookieName(secure);

    const cookie = request.cookies[cookieName];

    if (!cookie) {
      throw new UnauthorizedException('Sessão não encontrada.');
    }

    const unsigned = request.unsignCookie(cookie);

    if (!unsigned.valid || !unsigned.value) {
      throw new UnauthorizedException('Sessão inválida.');
    }

    const session = await this.sessionService.getSession(unsigned.value);

    if (!session || typeof session.csrfToken !== 'string') {
      throw new UnauthorizedException('Sessão expirada ou inválida.');
    }

    return { cookieName, sessionId: unsigned.value, session };
  }

  private matchesCsrfToken(expected: string, received: string): boolean {
    const expectedBuffer = Buffer.from(expected);

    const receivedBuffer = Buffer.from(received);

    return (
      expectedBuffer.length === receivedBuffer.length &&
      timingSafeEqual(expectedBuffer, receivedBuffer)
    );
  }
}
