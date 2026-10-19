import { Module } from '@nestjs/common';
import { CoreApiModule } from '../core-api/core-api.module.js';
import {
  CongregationsController,
  OrganizationController,
} from './presentation/organization.controllers.js';

// Rotas web de Organization e Congregation, encaminhadas à Core API.
@Module({
  imports: [CoreApiModule],
  controllers: [OrganizationController, CongregationsController],
})
export class OrganizationModule {}
