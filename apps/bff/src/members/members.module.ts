import { Module } from '@nestjs/common';
import { CoreApiModule } from '../core-api/core-api.module.js';
import { MembersController, MembershipsController } from './presentation/members.controllers.js';

// Rotas web de Members (membros e vínculos com congregações), encaminhadas à Core API.
@Module({
  imports: [CoreApiModule],
  controllers: [MembersController, MembershipsController],
})
export class MembersModule {}
