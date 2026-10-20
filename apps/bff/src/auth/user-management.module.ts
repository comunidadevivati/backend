import { Module } from '@nestjs/common';
import { CoreApiModule } from '../core-api/core-api.module.js';
import { CreateMembersFromUsersUseCase } from './application/create-members-from-users.use-case.js';
import { MemberRegistry } from './application/ports/member-registry.js';
import { UserManagementUseCases } from './application/user-management.use-cases.js';
import { EmailVerificationModule } from './email-verification.module.js';
import { CoreApiMemberRegistry } from './infrastructure/members/core-api-member-registry.js';
import { SessionService } from './infrastructure/session/session.service.js';
import { UserAccountRepository } from './infrastructure/users/user-account.repository.js';
import { UserPersonLinkRepository } from './infrastructure/users/user-person-link.repository.js';
import { UserRepository } from './infrastructure/users/user.repository.js';
import { SessionCookieService } from './presentation/session-cookie.service.js';
import { UsersController } from './presentation/users.controller.js';

// Gestão de contas (menu Usuários): listar, cadastrar, editar, suspender/reativar, excluir e
// converter em membro (registrado na Core API).
@Module({
  imports: [EmailVerificationModule, CoreApiModule],
  controllers: [UsersController],
  providers: [
    UserManagementUseCases,
    CreateMembersFromUsersUseCase,
    { provide: MemberRegistry, useClass: CoreApiMemberRegistry },
    UserAccountRepository,
    UserPersonLinkRepository,
    UserRepository,
    SessionService,
    SessionCookieService,
  ],
})
export class UserManagementModule {}
