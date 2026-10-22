import { Module } from '@nestjs/common';
import { AccountSecurityModule } from './account-security.module.js';
import { LoginUseCase } from './application/login.use-case.js';
import { RegisterUserUseCase } from './application/register-user.use-case.js';
import { EmailVerificationModule } from './email-verification.module.js';
import { SessionService } from './infrastructure/session/session.service.js';
import { UserRepository } from './infrastructure/users/user.repository.js';
import { PasswordRecoveryModule } from './password-recovery.module.js';
import { AuthController } from './presentation/auth.controller.js';
import { SessionCookieService } from './presentation/session-cookie.service.js';
import { UserManagementModule } from './user-management.module.js';

@Module({
  imports: [
    PasswordRecoveryModule,
    EmailVerificationModule,
    UserManagementModule,
    AccountSecurityModule,
  ],
  controllers: [AuthController],
  providers: [
    LoginUseCase,
    RegisterUserUseCase,
    SessionService,
    SessionCookieService,
    UserRepository,
  ],
})
export class AuthModule {}
