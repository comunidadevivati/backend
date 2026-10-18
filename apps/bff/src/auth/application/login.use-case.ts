import { Inject, Injectable } from '@nestjs/common';
import { hashPassword, verifyPassword } from '../infrastructure/password/password-hasher.js';
import { SessionService } from '../infrastructure/session/session.service.js';
import { UserRepository } from '../infrastructure/users/user.repository.js';

export interface LoginCommand {
  email: string;
  password: string;
}

export interface LoginResult {
  sessionToken: string;
  csrfToken: string;
  user: {
    id: string;
    email: string;
    name: string;
  };
}

@Injectable()
export class LoginUseCase {
  // Hash de referência para e-mails inexistentes: o tempo de resposta não revela quais contas existem.
  private dummyHash: Promise<string> | undefined;

  constructor(
    @Inject(UserRepository)
    private readonly userRepository: UserRepository,
    @Inject(SessionService)
    private readonly sessionService: SessionService,
  ) {}

  // Retorna null para qualquer falha de credencial, sem distinguir o motivo.
  async execute({ email, password }: LoginCommand): Promise<LoginResult | null> {
    const user = await this.userRepository.findByEmail(email);

    if (!user) {
      this.dummyHash ??= hashPassword(`dummy-${Date.now()}`);

      await verifyPassword(password, await this.dummyHash);

      return null;
    }

    const validPassword = await verifyPassword(password, user.passwordHash);

    if (!validPassword || user.status !== 'ACTIVE') {
      return null;
    }

    const { token, csrfToken } = await this.sessionService.createSession(user.id);

    return {
      sessionToken: token,
      csrfToken,
      user: { id: user.id, email: user.email, name: user.name },
    };
  }
}
