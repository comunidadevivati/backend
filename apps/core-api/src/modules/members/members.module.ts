import { Module } from '@nestjs/common';
import { OrganizationPublicModule } from '../organization/public/organization-public.module.js';
import {
  ChangeMemberStatusUseCase,
  GetMemberUseCase,
  ListMembersUseCase,
  RegisterMemberUseCase,
  UpdateMemberUseCase,
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
  MemberRepository,
  MembershipRepository,
} from './application/ports.js';
import {
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
    { provide: MembershipRepository, useClass: DrizzleMembershipRepository },
    { provide: CongregationCatalog, useClass: OrganizationCongregationCatalog },
    { provide: IdGenerator, useClass: UuidV7IdGenerator },
    { provide: Clock, useClass: SystemClock },
    {
      provide: ListMembersUseCase,
      useFactory: (members: MemberRepository) => new ListMembersUseCase(members),
      inject: [MemberRepository],
    },
    {
      provide: GetMemberUseCase,
      useFactory: (members: MemberRepository) => new GetMemberUseCase(members),
      inject: [MemberRepository],
    },
    {
      provide: RegisterMemberUseCase,
      useFactory: (members: MemberRepository, ids: IdGenerator, clock: Clock) =>
        new RegisterMemberUseCase(members, ids, clock),
      inject: [MemberRepository, IdGenerator, Clock],
    },
    {
      provide: UpdateMemberUseCase,
      useFactory: (members: MemberRepository, clock: Clock) =>
        new UpdateMemberUseCase(members, clock),
      inject: [MemberRepository, Clock],
    },
    {
      provide: ChangeMemberStatusUseCase,
      useFactory: (members: MemberRepository, memberships: MembershipRepository) =>
        new ChangeMemberStatusUseCase(members, memberships),
      inject: [MemberRepository, MembershipRepository],
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
