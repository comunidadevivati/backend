import { Module } from '@nestjs/common';
import { SessionService } from '../auth/infrastructure/session/session.service.js';
import { SessionCookieService } from '../auth/presentation/session-cookie.service.js';
import { CoreApiClient } from '../core-api/infrastructure/core-api.client.js';
import { CoreApiForwarder } from './presentation/core-api-forwarder.service.js';
import {
  CongregationsController,
  OrganizationController,
} from './presentation/organization.controllers.js';

// Rotas web de Organization e Congregation, encaminhadas à Core API.
@Module({
  controllers: [OrganizationController, CongregationsController],
  providers: [SessionService, SessionCookieService, CoreApiClient, CoreApiForwarder],
})
export class OrganizationModule {}
