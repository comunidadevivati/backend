import { Controller, Get, Header, Inject, Req, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { getSessionCookieName } from '../domain/constants/session-cookie.constants.js';
import { SessionService } from '../infrastructure/session/session.service.js';
import type { FastifyRequest } from 'fastify';

interface AuthenticatedUser {
  authenticated: true;
  subject: string;
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

    if (!session) {
      throw new UnauthorizedException('Sessão expirada ou inválida.');
    }

    return {
      authenticated: true,
      subject: session.subject,
    };
  }
}
