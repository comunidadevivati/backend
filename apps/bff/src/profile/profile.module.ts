import { Module } from '@nestjs/common';
import { SessionService } from '../auth/infrastructure/session/session.service.js';
import { AccountProfileRepository } from '../auth/infrastructure/users/account-profile.repository.js';
import { SessionCookieService } from '../auth/presentation/session-cookie.service.js';
import { CoreApiModule } from '../core-api/core-api.module.js';
import { ProfileController } from './presentation/profile.controller.js';

// Perfil da pessoa logada (somente membros): cadastro da Pessoa na Core API e preferências da conta.
@Module({
  imports: [CoreApiModule],
  controllers: [ProfileController],
  providers: [AccountProfileRepository, SessionService, SessionCookieService],
})
export class ProfileModule {}
