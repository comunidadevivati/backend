import { Module } from '@nestjs/common';
import { SessionService } from '../auth/infrastructure/session/session.service.js';
import { SessionCookieService } from '../auth/presentation/session-cookie.service.js';
import { CoreApiClient } from './infrastructure/core-api.client.js';
import { CoreApiForwarder } from './presentation/core-api-forwarder.service.js';

// Integração com a Core API (ADR 0006), compartilhada pelos módulos das rotas de negócio.
@Module({
  providers: [SessionService, SessionCookieService, CoreApiClient, CoreApiForwarder],
  exports: [CoreApiClient, CoreApiForwarder],
})
export class CoreApiModule {}
