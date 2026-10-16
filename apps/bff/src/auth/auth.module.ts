import { Module } from '@nestjs/common';
import { LoginUseCase } from './application/login.use-case.js';
import { SessionService } from './infrastructure/session/session.service.js';
import { UserRepository } from './infrastructure/users/user.repository.js';
import { AuthController } from './presentation/auth.controller.js';

@Module({
  controllers: [AuthController],
  providers: [LoginUseCase, SessionService, UserRepository],
})
export class AuthModule {}
