import { Module } from '@nestjs/common';
import { OidcClientService } from './infrastructure/keycloak/oidc-client.service.js';
import { SessionService } from './infrastructure/session/session.service.js';
import { AuthMeController } from './presentation/auth-me.controller.js';
import { AuthController } from './presentation/auth.controller.js';

@Module({
  controllers: [AuthController, AuthMeController],
  providers: [OidcClientService, SessionService],
  exports: [OidcClientService, SessionService],
})
export class AuthModule {}
