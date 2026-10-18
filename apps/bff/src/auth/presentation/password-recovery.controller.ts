import {
  BadRequestException,
  Body,
  Controller,
  Header,
  HttpCode,
  Inject,
  Post,
} from '@nestjs/common';
import { z } from 'zod';
import { RequestPasswordRecoveryUseCase } from '../application/request-password-recovery.use-case.js';
import { ResetPasswordUseCase } from '../application/reset-password.use-case.js';
import { PASSWORD_MAX_LENGTH } from '../domain/policies/password-policy.js';

const passwordRecoveryRequestSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email().max(254)),
});

const PASSWORD_RESET_REQUESTED_MESSAGE =
  'Se existir uma conta para este e-mail, enviaremos as instruções.';

const passwordResetRequestSchema = z.object({
  token: z.string().regex(/^[A-Za-z0-9_-]{43}$/u),
  password: z.string().max(PASSWORD_MAX_LENGTH),
});

export interface PasswordRecoveryResponse {
  message: string;
}

@Controller('auth')
export class PasswordRecoveryController {
  constructor(
    @Inject(RequestPasswordRecoveryUseCase)
    private readonly requestPasswordRecoveryUseCase: RequestPasswordRecoveryUseCase,
    @Inject(ResetPasswordUseCase)
    private readonly resetPasswordUseCase: ResetPasswordUseCase,
  ) {}

  @Post('password-recovery')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  async request(@Body() body: unknown): Promise<PasswordRecoveryResponse> {
    const request = passwordRecoveryRequestSchema.safeParse(body);

    if (request.success) {
      await this.requestPasswordRecoveryUseCase.execute(request.data);
    }

    return { message: PASSWORD_RESET_REQUESTED_MESSAGE };
  }

  @Post('password-reset')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  async reset(@Body() body: unknown): Promise<PasswordRecoveryResponse> {
    const request = passwordResetRequestSchema.safeParse(body);

    if (!request.success) {
      throw new BadRequestException('Link ou nova senha inválidos.');
    }

    const result = await this.resetPasswordUseCase.execute(request.data);

    if (result === 'invalid_token') {
      throw new BadRequestException('Link de recuperação inválido ou expirado.');
    }

    if (result === 'weak_password') {
      throw new BadRequestException('A nova senha não atende aos requisitos de segurança.');
    }

    return { message: 'Senha redefinida com sucesso. Faça login novamente.' };
  }
}
