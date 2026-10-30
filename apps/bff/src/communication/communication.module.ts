import { Module } from '@nestjs/common';
import { CoreApiModule } from '../core-api/core-api.module.js';
import { EmailGroupsController } from './presentation/email-groups.controller.js';

// Rotas web dos grupos de e-mails (ADR 0013), encaminhadas à Core API.
@Module({
  imports: [CoreApiModule],
  controllers: [EmailGroupsController],
})
export class CommunicationModule {}
