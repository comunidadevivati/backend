import { Module } from '@nestjs/common';
import { UserManagementUseCases } from './application/user-management.use-cases.js';
import { EmailVerificationModule } from './email-verification.module.js';
import { SessionService } from './infrastructure/session/session.service.js';
import { UserAccountRepository } from './infrastructure/users/user-account.repository.js';
import { UserRepository } from './infrastructure/users/user.repository.js';
import { SessionCookieService } from './presentation/session-cookie.service.js';
import { UsersController } from './presentation/users.controller.js';

// Gestão de contas (menu Usuários): listar, cadastrar, editar, suspender/reativar e excluir.
@Module({
  imports: [EmailVerificationModule],
  controllers: [UsersController],
  providers: [
    UserManagementUseCases,
    UserAccountRepository,
    UserRepository,
    SessionService,
    SessionCookieService,
  ],
})
export class UserManagementModule {}
