import { Module } from '@nestjs/common';
import {
  CreateBacklogCardUseCase,
  DeleteBacklogCardUseCase,
  ListBacklogCardsUseCase,
  MoveBacklogCardUseCase,
  UpdateBacklogCardUseCase,
} from './application/backlog-card.use-cases.js';
import { BacklogCardRepository, IdGenerator } from './application/ports.js';
import {
  DrizzleBacklogCardRepository,
  UuidV7IdGenerator,
} from './infrastructure/drizzle-backlog-cards.repository.js';
import { BacklogCardsController } from './presentation/backlog-cards.controller.js';

// Composition Root do contexto Backlog (ADR 0014): os Use Cases não conhecem o NestJS e são montados
// por factories.
@Module({
  controllers: [BacklogCardsController],
  providers: [
    { provide: BacklogCardRepository, useClass: DrizzleBacklogCardRepository },
    { provide: IdGenerator, useClass: UuidV7IdGenerator },
    {
      provide: ListBacklogCardsUseCase,
      useFactory: (cards: BacklogCardRepository) => new ListBacklogCardsUseCase(cards),
      inject: [BacklogCardRepository],
    },
    {
      provide: CreateBacklogCardUseCase,
      useFactory: (cards: BacklogCardRepository, ids: IdGenerator) =>
        new CreateBacklogCardUseCase(cards, ids),
      inject: [BacklogCardRepository, IdGenerator],
    },
    {
      provide: UpdateBacklogCardUseCase,
      useFactory: (cards: BacklogCardRepository) => new UpdateBacklogCardUseCase(cards),
      inject: [BacklogCardRepository],
    },
    {
      provide: MoveBacklogCardUseCase,
      useFactory: (cards: BacklogCardRepository) => new MoveBacklogCardUseCase(cards),
      inject: [BacklogCardRepository],
    },
    {
      provide: DeleteBacklogCardUseCase,
      useFactory: (cards: BacklogCardRepository) => new DeleteBacklogCardUseCase(cards),
      inject: [BacklogCardRepository],
    },
  ],
})
export class BacklogModule {}
