import { Inject, Injectable, Logger } from '@nestjs/common';
import { isUniqueViolation } from '../../shared/infrastructure/database/database-errors.js';
import { hashPassword } from '../infrastructure/password/password-hasher.js';
import {
  UserAccountRepository,
  type DeleteUserAccountResult,
  type UserAccount,
  type UserAccountChanges,
  type UserStatus,
} from '../infrastructure/users/user-account.repository.js';
import { UserRepository } from '../infrastructure/users/user.repository.js';
import { SendEmailVerificationUseCase } from './send-email-verification.use-case.js';
import type { RegisterUserCommand } from './register-user.use-case.js';

export interface ListUsersQuery {
  status: UserStatus | null;
  emailVerified: boolean | null;
  hasPerson: boolean | null;
  search: string | null;
  cursor: string | null;
  limit: number;
}

export interface UserPage {
  items: UserAccount[];
  nextCursor: string | null;
}

export type CreateUserResult =
  | { status: 'created'; account: UserAccount }
  | { status: 'email_taken' };

export type ChangeUserStatusResult =
  | { status: 'changed'; account: UserAccount }
  | { status: 'not_found' }
  | { status: 'self' };

// Gestão de contas (menu Usuários). Quem opera é a conta da sessão (actorId): ela não pode suspender
// nem excluir a si mesma, para não perder o próprio acesso.
@Injectable()
export class UserManagementUseCases {
  private readonly logger = new Logger(UserManagementUseCases.name);

  constructor(
    @Inject(UserAccountRepository)
    private readonly accounts: UserAccountRepository,
    @Inject(UserRepository)
    private readonly userRepository: UserRepository,
    @Inject(SendEmailVerificationUseCase)
    private readonly sendEmailVerification: SendEmailVerificationUseCase,
  ) {}

  // Paginação por cursor: busca um item a mais para saber se existe a próxima página.
  async list({ cursor, limit, ...filters }: ListUsersQuery): Promise<UserPage> {
    const rows = await this.accounts.list({ ...filters, after: cursor, limit: limit + 1 });

    const items = rows.slice(0, limit);

    return {
      items,
      nextCursor: rows.length > limit ? (items.at(-1)?.id ?? null) : null,
    };
  }

  get(id: string): Promise<UserAccount | null> {
    return this.accounts.findById(id);
  }

  // Mesmo cadastro da tela de login (dados, senha e link de verificação), mas sem abrir sessão para
  // a nova conta: a sessão de quem cadastra continua a mesma.
  async create({ email, name, password, phone }: RegisterUserCommand): Promise<CreateUserResult> {
    const passwordHash = await hashPassword(password);

    let id: string;

    try {
      id = await this.userRepository.create({ email, name, phone, passwordHash });
    } catch (error) {
      if (isUniqueViolation(error)) {
        return { status: 'email_taken' };
      }

      throw error;
    }

    await this.sendVerificationLink(id, email, name);

    const account = await this.accounts.findById(id);

    if (!account) {
      throw new Error('Conta recém-criada não encontrada.');
    }

    return { status: 'created', account };
  }

  // Trocar o e-mail envia um novo link de verificação para o endereço novo.
  async update(id: string, changes: UserAccountChanges) {
    const result = await this.accounts.update(id, changes);

    if (result.status === 'updated' && result.emailChanged) {
      const { email, name } = result.account;

      await this.sendVerificationLink(id, email, name);
    }

    return result;
  }

  async changeStatus(
    actorId: string,
    id: string,
    status: UserStatus,
  ): Promise<ChangeUserStatusResult> {
    if (actorId === id) {
      return { status: 'self' };
    }

    const account = await this.accounts.setStatus(id, status);

    return account ? { status: 'changed', account } : { status: 'not_found' };
  }

  async delete(actorId: string, id: string): Promise<DeleteUserAccountResult | 'self'> {
    return actorId === id ? 'self' : this.accounts.deleteUnverified(id);
  }

  // Uma falha no envio não desfaz a operação: o link pode ser reenviado pelo menu da conta.
  private async sendVerificationLink(userId: string, email: string, name: string) {
    try {
      await this.sendEmailVerification.execute({ userId, email, name });
    } catch {
      this.logger.error('Falha ao enviar e-mail de verificação na gestão de usuários.');
    }
  }
}
