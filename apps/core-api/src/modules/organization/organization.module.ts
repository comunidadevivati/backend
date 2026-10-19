import { Module } from '@nestjs/common';
import {
  ChangeCongregationStatusUseCase,
  GetCongregationUseCase,
  ListCongregationsUseCase,
  RegisterCongregationUseCase,
  UpdateCongregationUseCase,
} from './application/congregation.use-cases.js';
import {
  ChangeOrganizationStatusUseCase,
  GetOrganizationUseCase,
  UpdateOrganizationUseCase,
} from './application/organization.use-cases.js';
import {
  CongregationRepository,
  IdGenerator,
  OrganizationRepository,
} from './application/ports.js';
import {
  DrizzleCongregationRepository,
  DrizzleOrganizationRepository,
  UuidV7IdGenerator,
} from './infrastructure/drizzle-organization.repositories.js';
import { CongregationsController } from './presentation/congregations.controller.js';
import { OrganizationController } from './presentation/organization.controller.js';

// Composition Root do contexto: os Use Cases não conhecem o NestJS e são montados por factories.
@Module({
  controllers: [OrganizationController, CongregationsController],
  providers: [
    { provide: OrganizationRepository, useClass: DrizzleOrganizationRepository },
    { provide: CongregationRepository, useClass: DrizzleCongregationRepository },
    { provide: IdGenerator, useClass: UuidV7IdGenerator },
    {
      provide: GetOrganizationUseCase,
      useFactory: (organizations: OrganizationRepository) =>
        new GetOrganizationUseCase(organizations),
      inject: [OrganizationRepository],
    },
    {
      provide: UpdateOrganizationUseCase,
      useFactory: (organizations: OrganizationRepository) =>
        new UpdateOrganizationUseCase(organizations),
      inject: [OrganizationRepository],
    },
    {
      provide: ChangeOrganizationStatusUseCase,
      useFactory: (organizations: OrganizationRepository) =>
        new ChangeOrganizationStatusUseCase(organizations),
      inject: [OrganizationRepository],
    },
    {
      provide: ListCongregationsUseCase,
      useFactory: (congregations: CongregationRepository) =>
        new ListCongregationsUseCase(congregations),
      inject: [CongregationRepository],
    },
    {
      provide: GetCongregationUseCase,
      useFactory: (congregations: CongregationRepository) =>
        new GetCongregationUseCase(congregations),
      inject: [CongregationRepository],
    },
    {
      provide: RegisterCongregationUseCase,
      useFactory: (
        organizations: OrganizationRepository,
        congregations: CongregationRepository,
        ids: IdGenerator,
      ) => new RegisterCongregationUseCase(organizations, congregations, ids),
      inject: [OrganizationRepository, CongregationRepository, IdGenerator],
    },
    {
      provide: UpdateCongregationUseCase,
      useFactory: (congregations: CongregationRepository) =>
        new UpdateCongregationUseCase(congregations),
      inject: [CongregationRepository],
    },
    {
      provide: ChangeCongregationStatusUseCase,
      useFactory: (organizations: OrganizationRepository, congregations: CongregationRepository) =>
        new ChangeCongregationStatusUseCase(organizations, congregations),
      inject: [OrganizationRepository, CongregationRepository],
    },
  ],
})
export class OrganizationModule {}
