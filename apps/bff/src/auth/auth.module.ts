import { Module } from '@nestjs/common';
import { LoginUseCase } from './application/login.use-case.js';
import { RegisterUserUseCase } from './application/register-user.use-case.js';
import { SessionService } from './infrastructure/session/session.service.js';
import { UserRepository } from './infrastructure/users/user.repository.js';
import { PasswordRecoveryModule } from './password-recovery.module.js';
import { AuthController } from './presentation/auth.controller.js';
import { SessionCookieService } from './presentation/session-cookie.service.js';

@Module({
  imports: [PasswordRecoveryModule],
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
