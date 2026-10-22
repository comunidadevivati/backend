import {
  BadRequestException,
  Body,
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
import { AccountSecurityUseCases } from '../application/account-security.use-cases.js';
import { PASSWORD_MAX_LENGTH } from '../domain/policies/password-policy.js';
import { SessionCookieService } from './session-cookie.service.js';
import type { FastifyRequest } from 'fastify';

const changePasswordRequestSchema = z.strictObject({
  currentPassword: z.string().min(1).max(1024),
  newPassword: z.string().max(PASSWORD_MAX_LENGTH),
});

const emailChangeRequestSchema = z.strictObject({
  currentPassword: z.string().min(1).max(1024),
  newEmail: z.string().trim().toLowerCase().pipe(z.email().max(254)),
});

const emailChangeConfirmationSchema = z.object({
  token: z.string().regex(/^[A-Za-z0-9_-]{43}$/u),
});

const INVALID_LINK_MESSAGE = 'Link de confirmação inválido ou expirado.';

export interface AccountSecurityResponse {
  message: string;
}

type SecurityErrorCode = 'invalid_password' | 'weak_password' | 'same_email' | 'email_taken';

// Erro com código estável para o frontend, além da mensagem legível.
const coded = (status: HttpStatus, code: SecurityErrorCode, message: string) =>
  new HttpException({ statusCode: status, code, message }, status);

const invalidPassword = () =>
  coded(HttpStatus.BAD_REQUEST, 'invalid_password', 'A senha atual não confere.');

const emailTaken = () =>
  coded(HttpStatus.CONFLICT, 'email_taken', 'Já existe uma conta com este e-mail.');

// Segurança da conta (Perfil): trocar a senha e o e-mail de acesso. Exigem sessão, X-CSRF-Token e a
// senha atual; a confirmação do novo e-mail é pública, pois o link pode ser aberto em outro aparelho.
@Controller('auth')
export class AccountSecurityController {
  private readonly logger = new Logger(AccountSecurityController.name);

  constructor(
    @Inject(AccountSecurityUseCases)
    private readonly security: AccountSecurityUseCases,
    @Inject(SessionCookieService)
    private readonly sessionCookies: SessionCookieService,
  ) {}

  // Mantém a sessão atual e encerra as demais.
  @Post('password')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  async changePassword(
    @Body() body: unknown,
    @Req() request: FastifyRequest,
  ): Promise<AccountSecurityResponse> {
    const { session, sessionToken } = await this.sessionCookies.requireSession(request);

    this.sessionCookies.assertCsrfToken(request, session);

    const input = changePasswordRequestSchema.safeParse(body);

    if (!input.success) {
      throw new BadRequestException('Informe a senha atual e a nova senha.');
    }

    const result = await this.security.changePassword({
      userId: session.userId,
      sessionToken,
      ...input.data,
    });

    if (result === 'invalid_password') {
      throw invalidPassword();
    }

    if (result === 'weak_password') {
      throw coded(
        HttpStatus.BAD_REQUEST,
        'weak_password',
        'A nova senha não atende aos requisitos de segurança ou é igual à atual.',
      );
    }

    return { message: 'Senha alterada. As outras sessões da conta foram encerradas.' };
  }

  // Envia o link de confirmação ao novo e-mail; o e-mail atual continua valendo até ele ser aberto.
  @Post('email-change')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  async requestEmailChange(
    @Body() body: unknown,
    @Req() request: FastifyRequest,
  ): Promise<AccountSecurityResponse> {
    const { session } = await this.sessionCookies.requireSession(request);

    this.sessionCookies.assertCsrfToken(request, session);

    const input = emailChangeRequestSchema.safeParse(body);

    if (!input.success) {
      throw new BadRequestException('Informe um e-mail válido e a senha atual.');
    }

    let result: Awaited<ReturnType<AccountSecurityUseCases['requestEmailChange']>>;

    try {
      result = await this.security.requestEmailChange({ userId: session.userId, ...input.data });
    } catch {
      this.logger.error('Falha ao enviar o e-mail de confirmação da troca de e-mail.');

      throw new ServiceUnavailableException(
        'Não foi possível enviar o e-mail de confirmação. Tente novamente em instantes.',
      );
    }

    switch (result) {
      case 'invalid_password':
        throw invalidPassword();

      case 'same_email':
        throw coded(HttpStatus.CONFLICT, 'same_email', 'Este já é o seu e-mail de acesso.');

      case 'email_taken':
        throw emailTaken();

      case 'cooldown':
        throw new HttpException(
          'Aguarde alguns instantes antes de solicitar um novo e-mail.',
          HttpStatus.TOO_MANY_REQUESTS,
        );

      default:
        return {
          message: `Enviamos um link de confirmação para ${input.data.newEmail}. O e-mail atual continua valendo até a confirmação.`,
        };
    }
  }

  @Post('email-change/confirm')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  async confirmEmailChange(@Body() body: unknown): Promise<AccountSecurityResponse> {
    const input = emailChangeConfirmationSchema.safeParse(body);

    if (!input.success) {
      throw new BadRequestException(INVALID_LINK_MESSAGE);
    }

    let result: Awaited<ReturnType<AccountSecurityUseCases['confirmEmailChange']>>;

    try {
      result = await this.security.confirmEmailChange(input.data.token);
    } catch {
      this.logger.error('Falha ao confirmar a troca do e-mail de acesso.');

      throw new ServiceUnavailableException(
        'Não foi possível concluir a troca agora. Abra o link novamente em instantes.',
      );
    }

    if (result === 'invalid_token') {
      throw new BadRequestException(INVALID_LINK_MESSAGE);
    }

    if (result === 'email_taken') {
      throw emailTaken();
    }

    return { message: 'E-mail de acesso alterado com sucesso.' };
  }
}
