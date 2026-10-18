import { Inject, Injectable, Logger } from '@nestjs/common';
import { isUniqueViolation } from '../../shared/infrastructure/database/database-errors.js';
import { hashPassword } from '../infrastructure/password/password-hasher.js';
import { SessionService } from '../infrastructure/session/session.service.js';
import { UserRepository } from '../infrastructure/users/user.repository.js';
import { SendEmailVerificationUseCase } from './send-email-verification.use-case.js';
import type { LoginResult } from './login.use-case.js';

export interface RegisterUserCommand {
  name: string;
  phone: string;
  email: string;
  password: string;
}

export type RegisterUserResult =
  | { status: 'created'; session: LoginResult }
  | { status: 'email_taken' };

@Injectable()
export class RegisterUserUseCase {
  private readonly logger = new Logger(RegisterUserUseCase.name);

  constructor(
    @Inject(UserRepository)
    private readonly userRepository: UserRepository,
    @Inject(SessionService)
    private readonly sessionService: SessionService,
    @Inject(SendEmailVerificationUseCase)
    private readonly sendEmailVerificationUseCase: SendEmailVerificationUseCase,
  ) {}

  // Os dados chegam validados pela apresentação. A conta nasce ACTIVE e já recebe uma sessão, pelo
  // mesmo serviço do login, sem verificar a senha de novo nem consumir uma tentativa de login.
  async execute({
    email,
    name,
    password,
    phone,
  }: RegisterUserCommand): Promise<RegisterUserResult> {
    const passwordHash = await hashPassword(password);

    let id: string;

    try {
      id = await this.userRepository.create({ email, name, phone, passwordHash });
    } catch (error) {
      // A restrição UNIQUE do e-mail decide, sem condição de corrida entre cadastros simultâneos.
      if (isUniqueViolation(error)) {
        return { status: 'email_taken' };
      }

      throw error;
    }

    const { csrfToken, token } = await this.sessionService.createSession(id);

    // A conta nasce com o e-mail não verificado. Uma falha no envio não desfaz o cadastro: a pessoa
    // pode pedir um novo link pelo menu da conta.
    try {
      await this.sendEmailVerificationUseCase.execute({ userId: id, email, name });
    } catch {
      this.logger.error('Falha ao enviar e-mail de verificação no cadastro.');
    }

    return {
      status: 'created',
      session: {
        sessionToken: token,
        csrfToken,
        user: { id, email, name, emailVerified: false },
      },
    };
  }
}
