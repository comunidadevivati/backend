import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Header,
  HttpCode,
  HttpException,
  HttpStatus,
  Inject,
  Logger,
  Post,
  Req,
  ServiceUnavailableException,
} from '@nestjs/common';
import { z } from 'zod';
import { SendEmailVerificationUseCase } from '../application/send-email-verification.use-case.js';
import { VerifyEmailUseCase } from '../application/verify-email.use-case.js';
import { SessionCookieService } from './session-cookie.service.js';
import type { FastifyRequest } from 'fastify';

const emailVerificationRequestSchema = z.object({
  token: z.string().regex(/^[A-Za-z0-9_-]{43}$/u),
});

const INVALID_LINK_MESSAGE = 'Link de verificação inválido ou expirado.';

export interface EmailVerificationResponse {
  message: string;
}

@Controller('auth/email-verification')
export class EmailVerificationController {
  private readonly logger = new Logger(EmailVerificationController.name);

  constructor(
    @Inject(VerifyEmailUseCase)
    private readonly verifyEmailUseCase: VerifyEmailUseCase,
    @Inject(SendEmailVerificationUseCase)
    private readonly sendEmailVerificationUseCase: SendEmailVerificationUseCase,
    @Inject(SessionCookieService)
    private readonly sessionCookies: SessionCookieService,
  ) {}

  // Público: o link pode ser aberto em outro navegador ou aparelho, sem sessão.
  @Post()
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  async verify(@Body() body: unknown): Promise<EmailVerificationResponse> {
    const request = emailVerificationRequestSchema.safeParse(body);

    if (!request.success) {
      throw new BadRequestException(INVALID_LINK_MESSAGE);
    }

    if ((await this.verifyEmailUseCase.execute(request.data.token)) === 'invalid_token') {
      throw new BadRequestException(INVALID_LINK_MESSAGE);
    }

    return { message: 'E-mail verificado com sucesso.' };
  }

  // Reenvio para o e-mail da própria sessão; exige o token CSRF.
  @Post('resend')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  async resend(@Req() request: FastifyRequest): Promise<EmailVerificationResponse> {
    const { session } = await this.sessionCookies.requireSession(request);

    this.sessionCookies.assertCsrfToken(request, session);

    let result: Awaited<ReturnType<SendEmailVerificationUseCase['execute']>>;

    try {
      result = await this.sendEmailVerificationUseCase.execute({
        userId: session.userId,
        email: session.email,
        name: session.name,
      });
    } catch {
      this.logger.error('Falha ao reenviar e-mail de verificação.');

      throw new ServiceUnavailableException(
        'Não foi possível enviar o e-mail de verificação. Tente novamente em instantes.',
      );
    }

    if (result === 'already_verified') {
      throw new ConflictException('Este e-mail já foi verificado.');
    }

    if (result === 'cooldown') {
      throw new HttpException(
        'Aguarde alguns instantes antes de solicitar um novo e-mail.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    return { message: `Enviamos um novo link de verificação para ${session.email}.` };
  }
}
