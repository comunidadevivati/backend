import { Module } from '@nestjs/common';
import { CoreApiModule } from '../core-api/core-api.module.js';
import { BacklogCardsController } from './presentation/backlog-cards.controller.js';

// Rotas web do backlog (ADR 0014), encaminhadas à Core API.
@Module({
  imports: [CoreApiModule],
  controllers: [BacklogCardsController],
})
export class BacklogModule {}
