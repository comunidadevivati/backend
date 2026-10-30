import { Module } from '@nestjs/common';
import {
  CreateEmailGroupUseCase,
  DeleteEmailGroupUseCase,
  GetEmailGroupUseCase,
  ListEmailGroupsUseCase,
  UpdateEmailGroupUseCase,
} from './application/email-group.use-cases.js';
import { EmailGroupRepository, IdGenerator } from './application/ports.js';
import {
  DrizzleEmailGroupRepository,
  UuidV7IdGenerator,
} from './infrastructure/drizzle-email-groups.repository.js';
import { EmailGroupsController } from './presentation/email-groups.controller.js';

// Composition Root do contexto Communication (ADR 0013): os Use Cases não conhecem o NestJS e são
// montados por factories.
@Module({
  controllers: [EmailGroupsController],
  providers: [
    { provide: EmailGroupRepository, useClass: DrizzleEmailGroupRepository },
    { provide: IdGenerator, useClass: UuidV7IdGenerator },
    {
      provide: ListEmailGroupsUseCase,
      useFactory: (groups: EmailGroupRepository) => new ListEmailGroupsUseCase(groups),
      inject: [EmailGroupRepository],
    },
    {
      provide: GetEmailGroupUseCase,
      useFactory: (groups: EmailGroupRepository) => new GetEmailGroupUseCase(groups),
      inject: [EmailGroupRepository],
    },
    {
      provide: CreateEmailGroupUseCase,
      useFactory: (groups: EmailGroupRepository, ids: IdGenerator) =>
        new CreateEmailGroupUseCase(groups, ids),
      inject: [EmailGroupRepository, IdGenerator],
    },
    {
      provide: UpdateEmailGroupUseCase,
      useFactory: (groups: EmailGroupRepository) => new UpdateEmailGroupUseCase(groups),
      inject: [EmailGroupRepository],
    },
    {
      provide: DeleteEmailGroupUseCase,
      useFactory: (groups: EmailGroupRepository) => new DeleteEmailGroupUseCase(groups),
      inject: [EmailGroupRepository],
    },
  ],
})
export class CommunicationModule {}
