import { timingSafeEqual } from 'node:crypto';
import {
  BadRequestException,
  Body,
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
import { z } from 'zod';
import { LoginUseCase } from '../application/login.use-case.js';
import { getSessionCookieName } from '../domain/constants/session-cookie.constants.js';
import {
  SESSION_ABSOLUTE_TIMEOUT_SECONDS,
  SessionService,
  type AuthSession,
} from '../infrastructure/session/session.service.js';
import type { FastifyReply, FastifyRequest } from 'fastify';

const loginRequestSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email().max(254)),
  password: z.string().min(1).max(1024),
});

export interface AuthenticatedUser {
  authenticated: true;
  csrfToken: string;
  user: {
    subject: string;
    email: string;
    name: string;
  };
}

interface SessionContext {
  cookieName: string;
  sessionToken: string;
  session: AuthSession;
}

@Controller('auth')
export class AuthController {
  constructor(
    @Inject(LoginUseCase)
    private readonly loginUseCase: LoginUseCase,
    @Inject(SessionService)
    private readonly sessionService: SessionService,
    @Inject(ConfigService)
    private readonly configService: ConfigService,
  ) {}

  @Post('login')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  async login(
    @Body() body: unknown,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<AuthenticatedUser> {
    const credentials = loginRequestSchema.safeParse(body);

    if (!credentials.success) {
      throw new BadRequestException('Informe um e-mail válido e a senha.');
    }

    const result = await this.loginUseCase.execute(credentials.data);

    if (!result) {
      throw new UnauthorizedException('E-mail ou senha inválidos.');
    }

    const cookieName = this.getCookieName();

    // Rotação: uma sessão anterior no mesmo navegador é revogada ao autenticar novamente.
    const previousToken = this.readSessionToken(request, cookieName);

    if (previousToken) {
      await this.sessionService.deleteSession(previousToken);
    }

    reply.setCookie(cookieName, result.sessionToken, {
      httpOnly: true,
      signed: true,
      secure: this.isHttps(),
      sameSite: 'lax',
      path: '/',
      maxAge: SESSION_ABSOLUTE_TIMEOUT_SECONDS,
    });

    return {
      authenticated: true,
      csrfToken: result.csrfToken,
      user: {
        subject: result.user.id,
        email: result.user.email,
        name: result.user.name,
      },
    };
  }

  @Get('me')
  @Header('Cache-Control', 'no-store')
  async me(@Req() request: FastifyRequest): Promise<AuthenticatedUser> {
    const { session } = await this.getSessionContext(request);

    return {
      authenticated: true,
      csrfToken: session.csrfToken,
      user: {
        subject: session.userId,
        email: session.email,
        name: session.name,
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
    const { cookieName, sessionToken, session } = await this.getSessionContext(request);

    const csrfToken = request.headers['x-csrf-token'];

    if (typeof csrfToken !== 'string' || !this.matchesCsrfToken(session.csrfToken, csrfToken)) {
      throw new ForbiddenException('Token CSRF inválido.');
    }

    await this.sessionService.deleteSession(sessionToken);

    reply.clearCookie(cookieName, { path: '/' });
  }

  private async getSessionContext(request: FastifyRequest): Promise<SessionContext> {
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

  private readSessionToken(request: FastifyRequest, cookieName: string): string | null {
    const cookie = request.cookies[cookieName];

    if (!cookie) {
      return null;
    }

    const unsigned = request.unsignCookie(cookie);

    return unsigned.valid && unsigned.value ? unsigned.value : null;
  }

  private matchesCsrfToken(expected: string, received: string): boolean {
    const expectedBuffer = Buffer.from(expected);

    const receivedBuffer = Buffer.from(received);

    return (
      expectedBuffer.length === receivedBuffer.length &&
      timingSafeEqual(expectedBuffer, receivedBuffer)
    );
  }

  private getCookieName(): string {
    return getSessionCookieName(this.isHttps());
  }

  private isHttps(): boolean {
    return new URL(this.configService.getOrThrow<string>('BFF_BASE_URL')).protocol === 'https:';
  }
}
