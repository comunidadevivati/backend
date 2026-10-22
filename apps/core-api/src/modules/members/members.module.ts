import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
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
  ChangePersonEmailUseCase,
  CompleteAvatarUploadUseCase,
  GetPersonUseCase,
  PersonViews,
  RemoveAvatarUseCase,
  RequestAvatarUploadUseCase,
  UpdatePersonUseCase,
} from './application/person.use-cases.js';
import {
  AvatarProcessor,
  AvatarStorage,
  Clock,
  CongregationCatalog,
  IdGenerator,
  MemberQueries,
  MemberRepository,
  MembershipRepository,
  PersonRepository,
} from './application/ports.js';
import {
  DrizzleMemberQueries,
  DrizzleMemberRepository,
  DrizzleMembershipRepository,
  DrizzlePersonRepository,
  SystemClock,
  UuidV7IdGenerator,
} from './infrastructure/drizzle-members.repositories.js';
import { OrganizationCongregationCatalog } from './infrastructure/organization-congregation-catalog.adapter.js';
import { DisabledAvatarStorage, S3AvatarStorage } from './infrastructure/s3-avatar.storage.js';
import { SharpAvatarProcessor } from './infrastructure/sharp-avatar.processor.js';
import { MembersController } from './presentation/members.controller.js';
import { MembershipsController } from './presentation/memberships.controller.js';
import { PeopleController } from './presentation/people.controller.js';

// Fotos de perfil no bucket de mídia conforme MEDIA_STORAGE (validado ao iniciar pelo env.schema).
const avatarStorageFactory = (config: ConfigService): AvatarStorage =>
  config.get<string>('MEDIA_STORAGE') === 's3'
    ? new S3AvatarStorage({
        endpoint: config.getOrThrow<string>('MEDIA_S3_ENDPOINT'),
        region: config.getOrThrow<string>('MEDIA_S3_REGION'),
        accessKeyId: config.getOrThrow<string>('MEDIA_S3_ACCESS_KEY_ID'),
        secretAccessKey: config.getOrThrow<string>('MEDIA_S3_SECRET_ACCESS_KEY'),
        bucket: config.getOrThrow<string>('MEDIA_BUCKET'),
        keyPrefix: config.getOrThrow<string>('MEDIA_KEY_PREFIX'),
      })
    : new DisabledAvatarStorage();

// Composition Root do contexto: os Use Cases não conhecem o NestJS e são montados por factories.
// De Organization, usa somente o contrato público CongregationDirectory (OrganizationPublicModule).
@Module({
  imports: [OrganizationPublicModule],
  controllers: [MembersController, MembershipsController, PeopleController],
  providers: [
    { provide: PersonRepository, useClass: DrizzlePersonRepository },
    { provide: AvatarStorage, useFactory: avatarStorageFactory, inject: [ConfigService] },
    { provide: AvatarProcessor, useClass: SharpAvatarProcessor },
    {
      provide: PersonViews,
      useFactory: (storage: AvatarStorage) => new PersonViews(storage),
      inject: [AvatarStorage],
    },
    {
      provide: GetPersonUseCase,
      useFactory: (people: PersonRepository, views: PersonViews) =>
        new GetPersonUseCase(people, views),
      inject: [PersonRepository, PersonViews],
    },
    {
      provide: UpdatePersonUseCase,
      useFactory: (people: PersonRepository, views: PersonViews, clock: Clock) =>
        new UpdatePersonUseCase(people, views, clock),
      inject: [PersonRepository, PersonViews, Clock],
    },
    {
      provide: ChangePersonEmailUseCase,
      useFactory: (people: PersonRepository, views: PersonViews) =>
        new ChangePersonEmailUseCase(people, views),
      inject: [PersonRepository, PersonViews],
    },
    {
      provide: RequestAvatarUploadUseCase,
      useFactory: (people: PersonRepository, storage: AvatarStorage, ids: IdGenerator) =>
        new RequestAvatarUploadUseCase(people, storage, ids),
      inject: [PersonRepository, AvatarStorage, IdGenerator],
    },
    {
      provide: CompleteAvatarUploadUseCase,
      useFactory: (
        people: PersonRepository,
        storage: AvatarStorage,
        processor: AvatarProcessor,
        views: PersonViews,
        ids: IdGenerator,
      ) => new CompleteAvatarUploadUseCase(people, storage, processor, views, ids),
      inject: [PersonRepository, AvatarStorage, AvatarProcessor, PersonViews, IdGenerator],
    },
    {
      provide: RemoveAvatarUseCase,
      useFactory: (people: PersonRepository, storage: AvatarStorage, views: PersonViews) =>
        new RemoveAvatarUseCase(people, storage, views),
      inject: [PersonRepository, AvatarStorage, PersonViews],
    },
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
