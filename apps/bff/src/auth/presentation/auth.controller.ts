import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Get,
  Header,
  HttpCode,
  Inject,
  Post,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { z } from 'zod';
import { LoginUseCase } from '../application/login.use-case.js';
import { RegisterUserUseCase } from '../application/register-user.use-case.js';
import { SessionService } from '../infrastructure/session/session.service.js';
import { registerRequestSchema } from './register-request.schema.js';
import {
  SessionCookieService,
  type AuthenticatedUser,
  type StartedSession,
} from './session-cookie.service.js';
import type { FastifyReply, FastifyRequest } from 'fastify';

const loginRequestSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email().max(254)),
  password: z.string().min(1).max(1024),
});

export interface LoggedOutUser {
  authenticated: false;
  message: string;
}

@Controller('auth')
export class AuthController {
  constructor(
    @Inject(LoginUseCase)
    private readonly loginUseCase: LoginUseCase,
    @Inject(RegisterUserUseCase)
    private readonly registerUserUseCase: RegisterUserUseCase,
    @Inject(SessionService)
    private readonly sessionService: SessionService,
    @Inject(SessionCookieService)
    private readonly sessionCookies: SessionCookieService,
  ) {}

  // Cadastro público: cria a conta ACTIVE e já abre a sessão, com a mesma resposta do login.
  @Post('register')
  @HttpCode(201)
  @Header('Cache-Control', 'no-store')
  async register(
    @Body() body: unknown,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<StartedSession> {
    const registration = registerRequestSchema.safeParse(body);

    if (!registration.success) {
      // Somente os nomes dos campos recusados, nunca os valores enviados.
      throw new BadRequestException({
        statusCode: 400,
        error: 'Bad Request',
        message: 'Dados de cadastro inválidos.',
        fields: [...new Set(registration.error.issues.map(({ path }) => path.join('.')))],
      });
    }

    const result = await this.registerUserUseCase.execute(registration.data);

    if (result.status === 'email_taken') {
      throw new ConflictException('Já existe uma conta com este e-mail.');
    }

    return this.sessionCookies.startSession(
      request,
      reply,
      result.session,
      'Usuário cadastrado com sucesso.',
    );
  }

  @Post('login')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  async login(
    @Body() body: unknown,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<StartedSession> {
    const credentials = loginRequestSchema.safeParse(body);

    if (!credentials.success) {
      throw new BadRequestException('Informe um e-mail válido e a senha.');
    }

    const result = await this.loginUseCase.execute(credentials.data);

    if (!result) {
      throw new UnauthorizedException('E-mail ou senha inválidos.');
    }

    return this.sessionCookies.startSession(
      request,
      reply,
      result,
      'Usuário autenticado com sucesso.',
    );
  }

  @Get('me')
  @Header('Cache-Control', 'no-store')
  async me(@Req() request: FastifyRequest): Promise<AuthenticatedUser> {
    const { session } = await this.sessionCookies.requireSession(request);

    return {
      authenticated: true,
      csrfToken: session.csrfToken,
      user: {
        subject: session.userId,
        email: session.email,
        name: session.name,
        emailVerified: session.emailVerified,
      },
    };
  }

  @Post('logout')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  async logout(
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<LoggedOutUser> {
    const { cookieName, sessionToken, session } = await this.sessionCookies.requireSession(request);

    this.sessionCookies.assertCsrfToken(request, session);

    await this.sessionService.deleteSession(sessionToken);

    reply.clearCookie(cookieName, { path: '/' });

    return { authenticated: false, message: 'O logout foi efetuado com sucesso.' };
  }
}
