import { Module } from '@nestjs/common';
import { OrganizationPublicModule } from '../organization/public/organization-public.module.js';
import {
  ChangeMemberStatusUseCase,
  EnrollMemberUseCase,
  GetMemberUseCase,
  ListMembersUseCase,
} from './application/member.use-cases.js';
import {
  ChangeMembershipStatusUseCase,
  ListMembershipsUseCase,
  RegisterMembershipUseCase,
} from './application/membership.use-cases.js';
import {
  Clock,
  CongregationCatalog,
  IdGenerator,
  MemberQueries,
  MemberRepository,
  MembershipRepository,
} from './application/ports.js';
import {
  DrizzleMemberQueries,
  DrizzleMemberRepository,
  DrizzleMembershipRepository,
  SystemClock,
  UuidV7IdGenerator,
} from './infrastructure/drizzle-members.repositories.js';
import { OrganizationCongregationCatalog } from './infrastructure/organization-congregation-catalog.adapter.js';
import { MembersController } from './presentation/members.controller.js';
import { MembershipsController } from './presentation/memberships.controller.js';

// Composition Root do contexto: os Use Cases não conhecem o NestJS e são montados por factories.
// De Organization, usa somente o contrato público CongregationDirectory (OrganizationPublicModule).
@Module({
  imports: [OrganizationPublicModule],
  controllers: [MembersController, MembershipsController],
  providers: [
    { provide: MemberRepository, useClass: DrizzleMemberRepository },
    { provide: MemberQueries, useClass: DrizzleMemberQueries },
    { provide: MembershipRepository, useClass: DrizzleMembershipRepository },
    { provide: CongregationCatalog, useClass: OrganizationCongregationCatalog },
    { provide: IdGenerator, useClass: UuidV7IdGenerator },
    { provide: Clock, useClass: SystemClock },
    {
      provide: ListMembersUseCase,
      useFactory: (queries: MemberQueries) => new ListMembersUseCase(queries),
      inject: [MemberQueries],
    },
    {
      provide: GetMemberUseCase,
      useFactory: (queries: MemberQueries) => new GetMemberUseCase(queries),
      inject: [MemberQueries],
    },
    {
      provide: EnrollMemberUseCase,
      useFactory: (
        members: MemberRepository,
        queries: MemberQueries,
        ids: IdGenerator,
        clock: Clock,
      ) => new EnrollMemberUseCase(members, queries, ids, clock),
      inject: [MemberRepository, MemberQueries, IdGenerator, Clock],
    },
    {
      provide: ChangeMemberStatusUseCase,
      useFactory: (
        members: MemberRepository,
        queries: MemberQueries,
        memberships: MembershipRepository,
      ) => new ChangeMemberStatusUseCase(members, queries, memberships),
      inject: [MemberRepository, MemberQueries, MembershipRepository],
    },
    {
      provide: ListMembershipsUseCase,
      useFactory: (
        members: MemberRepository,
        memberships: MembershipRepository,
        congregations: CongregationCatalog,
      ) => new ListMembershipsUseCase(members, memberships, congregations),
      inject: [MemberRepository, MembershipRepository, CongregationCatalog],
    },
    {
      provide: RegisterMembershipUseCase,
      useFactory: (
        members: MemberRepository,
        memberships: MembershipRepository,
        congregations: CongregationCatalog,
        ids: IdGenerator,
      ) => new RegisterMembershipUseCase(members, memberships, congregations, ids),
      inject: [MemberRepository, MembershipRepository, CongregationCatalog, IdGenerator],
    },
    {
      provide: ChangeMembershipStatusUseCase,
      useFactory: (
        members: MemberRepository,
        memberships: MembershipRepository,
        congregations: CongregationCatalog,
        clock: Clock,
      ) => new ChangeMembershipStatusUseCase(members, memberships, congregations, clock),
      inject: [MemberRepository, MembershipRepository, CongregationCatalog, Clock],
    },
  ],
})
export class MembersModule {}
