import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CommunicationPublicModule } from '../communication/public/communication-public.module.js';
import {
  PurgeAnswersUseCase,
  RecordDeliveryEventUseCase,
} from './application/delivery-and-purge.use-cases.js';
import { DuplicateFormUseCase } from './application/duplicate-form.use-case.js';
import {
  FinishEmailDispatchUseCase,
  PrepareInvitationsUseCase,
  StartEmailDispatchUseCase,
} from './application/email-dispatch.use-cases.js';
import {
  GetFormReportUseCase,
  ListFormResponsesUseCase,
} from './application/form-report.use-cases.js';
import { FormViews } from './application/form-views.js';
import {
  ChangeFormStatusUseCase,
  CreateFormUseCase,
  DeleteFormUseCase,
  GetFormsSummaryUseCase,
  GetFormUseCase,
  ListFormsUseCase,
  UpdateFormUseCase,
} from './application/form.use-cases.js';
import {
  CompleteHeaderImageUploadUseCase,
  RemoveHeaderImageUseCase,
  RequestHeaderImageUploadUseCase,
} from './application/header-image.use-cases.js';
import {
  LookupInvitationUseCase,
  SubmitAnswersUseCase,
} from './application/invitation-answer.use-cases.js';
import {
  CompletePaperAttachmentUploadUseCase,
  GetPaperAttachmentUrlUseCase,
  ListInvitationsUseCase,
  MarkPaperAnswerUseCase,
  RequestPaperAttachmentUploadUseCase,
  UnmarkPaperAnswerUseCase,
} from './application/paper-answer.use-cases.js';
import {
  Clock,
  FormImageStorage,
  FormInvitationRepository,
  FormRepository,
  HeaderImageProcessor,
  IdGenerator,
  InvitationTokens,
  RecipientGroupCatalog,
} from './application/ports.js';
import {
  DrizzleFormInvitationRepository,
  RandomInvitationTokens,
} from './infrastructure/drizzle-form-invitations.repository.js';
import { DrizzleFormRepository } from './infrastructure/drizzle-forms.repository.js';
import {
  DisabledFormImageStorage,
  S3FormImageStorage,
} from './infrastructure/s3-form-image.storage.js';
import { SharpHeaderImageProcessor } from './infrastructure/sharp-header-image.processor.js';
import {
  CommunicationRecipientGroupCatalog,
  SystemClock,
  UuidV7IdGenerator,
} from './infrastructure/system.adapters.js';
import {
  FormEmailDispatchesController,
  PublicFormInvitationsController,
} from './presentation/form-email-dispatches.controller.js';
import { FormInvitationsController } from './presentation/form-invitations.controller.js';
import {
  FormAnswersPurgeController,
  FormEmailEventsController,
} from './presentation/form-maintenance.controller.js';
import { DepartmentFormsController, FormsController } from './presentation/forms.controller.js';

// Imagens dos formulários no bucket de mídia conforme MEDIA_STORAGE (validado ao iniciar).
const imageStorageFactory = (config: ConfigService): FormImageStorage =>
  config.get<string>('MEDIA_STORAGE') === 's3'
    ? new S3FormImageStorage({
        endpoint: config.getOrThrow<string>('MEDIA_S3_ENDPOINT'),
        region: config.getOrThrow<string>('MEDIA_S3_REGION'),
        accessKeyId: config.getOrThrow<string>('MEDIA_S3_ACCESS_KEY_ID'),
        secretAccessKey: config.getOrThrow<string>('MEDIA_S3_SECRET_ACCESS_KEY'),
        bucket: config.getOrThrow<string>('MEDIA_BUCKET'),
        keyPrefix: config.getOrThrow<string>('MEDIA_KEY_PREFIX'),
      })
    : new DisabledFormImageStorage();

// Composition Root do contexto Forms (ADR 0013): os Use Cases não conhecem o NestJS e são montados
// por factories. De Communication, usa somente o contrato público EmailGroupDirectory.
@Module({
  imports: [CommunicationPublicModule],
  controllers: [
    DepartmentFormsController,
    FormsController,
    FormEmailDispatchesController,
    PublicFormInvitationsController,
    FormInvitationsController,
    FormEmailEventsController,
    FormAnswersPurgeController,
  ],
  providers: [
    { provide: FormRepository, useClass: DrizzleFormRepository },
    { provide: FormImageStorage, useFactory: imageStorageFactory, inject: [ConfigService] },
    { provide: HeaderImageProcessor, useClass: SharpHeaderImageProcessor },
    { provide: RecipientGroupCatalog, useClass: CommunicationRecipientGroupCatalog },
    { provide: IdGenerator, useClass: UuidV7IdGenerator },
    { provide: Clock, useClass: SystemClock },
    { provide: FormInvitationRepository, useClass: DrizzleFormInvitationRepository },
    { provide: InvitationTokens, useClass: RandomInvitationTokens },
    {
      provide: RecordDeliveryEventUseCase,
      useFactory: (invitations: FormInvitationRepository) =>
        new RecordDeliveryEventUseCase(invitations),
      inject: [FormInvitationRepository],
    },
    {
      provide: PurgeAnswersUseCase,
      useFactory: (
        forms: FormRepository,
        invitations: FormInvitationRepository,
        storage: FormImageStorage,
        views: FormViews,
        clock: Clock,
      ) => new PurgeAnswersUseCase(forms, invitations, storage, views, clock),
      inject: [FormRepository, FormInvitationRepository, FormImageStorage, FormViews, Clock],
    },
    {
      provide: GetFormReportUseCase,
      useFactory: (forms: FormRepository, invitations: FormInvitationRepository) =>
        new GetFormReportUseCase(forms, invitations),
      inject: [FormRepository, FormInvitationRepository],
    },
    {
      provide: ListFormResponsesUseCase,
      useFactory: (forms: FormRepository, invitations: FormInvitationRepository) =>
        new ListFormResponsesUseCase(forms, invitations),
      inject: [FormRepository, FormInvitationRepository],
    },
    {
      provide: ListInvitationsUseCase,
      useFactory: (forms: FormRepository, invitations: FormInvitationRepository) =>
        new ListInvitationsUseCase(forms, invitations),
      inject: [FormRepository, FormInvitationRepository],
    },
    {
      provide: MarkPaperAnswerUseCase,
      useFactory: (invitations: FormInvitationRepository, clock: Clock) =>
        new MarkPaperAnswerUseCase(invitations, clock),
      inject: [FormInvitationRepository, Clock],
    },
    {
      provide: UnmarkPaperAnswerUseCase,
      useFactory: (invitations: FormInvitationRepository, storage: FormImageStorage) =>
        new UnmarkPaperAnswerUseCase(invitations, storage),
      inject: [FormInvitationRepository, FormImageStorage],
    },
    {
      provide: RequestPaperAttachmentUploadUseCase,
      useFactory: (
        invitations: FormInvitationRepository,
        storage: FormImageStorage,
        ids: IdGenerator,
      ) => new RequestPaperAttachmentUploadUseCase(invitations, storage, ids),
      inject: [FormInvitationRepository, FormImageStorage, IdGenerator],
    },
    {
      provide: CompletePaperAttachmentUploadUseCase,
      useFactory: (
        invitations: FormInvitationRepository,
        storage: FormImageStorage,
        ids: IdGenerator,
        clock: Clock,
      ) => new CompletePaperAttachmentUploadUseCase(invitations, storage, ids, clock),
      inject: [FormInvitationRepository, FormImageStorage, IdGenerator, Clock],
    },
    {
      provide: GetPaperAttachmentUrlUseCase,
      useFactory: (invitations: FormInvitationRepository, storage: FormImageStorage) =>
        new GetPaperAttachmentUrlUseCase(invitations, storage),
      inject: [FormInvitationRepository, FormImageStorage],
    },
    {
      provide: FormViews,
      useFactory: (
        storage: FormImageStorage,
        invitations: FormInvitationRepository,
        clock: Clock,
        groups: RecipientGroupCatalog,
      ) => new FormViews(storage, invitations, clock, groups),
      inject: [FormImageStorage, FormInvitationRepository, Clock, RecipientGroupCatalog],
    },
    {
      provide: StartEmailDispatchUseCase,
      useFactory: (
        forms: FormRepository,
        groups: RecipientGroupCatalog,
        views: FormViews,
        ids: IdGenerator,
        clock: Clock,
        invitations: FormInvitationRepository,
      ) => new StartEmailDispatchUseCase(forms, groups, views, ids, clock, invitations),
      inject: [
        FormRepository,
        RecipientGroupCatalog,
        FormViews,
        IdGenerator,
        Clock,
        FormInvitationRepository,
      ],
    },
    {
      provide: PrepareInvitationsUseCase,
      useFactory: (
        forms: FormRepository,
        invitations: FormInvitationRepository,
        tokens: InvitationTokens,
        ids: IdGenerator,
        clock: Clock,
      ) => new PrepareInvitationsUseCase(forms, invitations, tokens, ids, clock),
      inject: [FormRepository, FormInvitationRepository, InvitationTokens, IdGenerator, Clock],
    },
    {
      provide: FinishEmailDispatchUseCase,
      useFactory: (
        forms: FormRepository,
        views: FormViews,
        clock: Clock,
        invitations: FormInvitationRepository,
      ) => new FinishEmailDispatchUseCase(forms, views, clock, invitations),
      inject: [FormRepository, FormViews, Clock, FormInvitationRepository],
    },
    {
      provide: LookupInvitationUseCase,
      useFactory: (
        forms: FormRepository,
        invitations: FormInvitationRepository,
        tokens: InvitationTokens,
        views: FormViews,
        clock: Clock,
      ) => new LookupInvitationUseCase(forms, invitations, tokens, views, clock),
      inject: [FormRepository, FormInvitationRepository, InvitationTokens, FormViews, Clock],
    },
    {
      provide: SubmitAnswersUseCase,
      useFactory: (
        forms: FormRepository,
        invitations: FormInvitationRepository,
        tokens: InvitationTokens,
        views: FormViews,
        clock: Clock,
        ids: IdGenerator,
      ) => new SubmitAnswersUseCase(forms, invitations, tokens, views, clock, ids),
      inject: [
        FormRepository,
        FormInvitationRepository,
        InvitationTokens,
        FormViews,
        Clock,
        IdGenerator,
      ],
    },
    {
      provide: ListFormsUseCase,
      useFactory: (forms: FormRepository, views: FormViews) => new ListFormsUseCase(forms, views),
      inject: [FormRepository, FormViews],
    },
    {
      provide: GetFormsSummaryUseCase,
      useFactory: (forms: FormRepository) => new GetFormsSummaryUseCase(forms),
      inject: [FormRepository],
    },
    {
      provide: GetFormUseCase,
      useFactory: (forms: FormRepository, views: FormViews) => new GetFormUseCase(forms, views),
      inject: [FormRepository, FormViews],
    },
    {
      provide: CreateFormUseCase,
      useFactory: (
        forms: FormRepository,
        views: FormViews,
        groups: RecipientGroupCatalog,
        ids: IdGenerator,
        clock: Clock,
      ) => new CreateFormUseCase(forms, views, groups, ids, clock),
      inject: [FormRepository, FormViews, RecipientGroupCatalog, IdGenerator, Clock],
    },
    {
      provide: UpdateFormUseCase,
      useFactory: (
        forms: FormRepository,
        views: FormViews,
        groups: RecipientGroupCatalog,
        ids: IdGenerator,
        clock: Clock,
        invitations: FormInvitationRepository,
      ) => new UpdateFormUseCase(forms, views, groups, ids, clock, invitations),
      inject: [
        FormRepository,
        FormViews,
        RecipientGroupCatalog,
        IdGenerator,
        Clock,
        FormInvitationRepository,
      ],
    },
    {
      provide: DuplicateFormUseCase,
      useFactory: (
        forms: FormRepository,
        views: FormViews,
        groups: RecipientGroupCatalog,
        storage: FormImageStorage,
        ids: IdGenerator,
        clock: Clock,
      ) => new DuplicateFormUseCase(forms, views, groups, storage, ids, clock),
      inject: [
        FormRepository,
        FormViews,
        RecipientGroupCatalog,
        FormImageStorage,
        IdGenerator,
        Clock,
      ],
    },
    {
      provide: ChangeFormStatusUseCase,
      useFactory: (forms: FormRepository, views: FormViews, clock: Clock) =>
        new ChangeFormStatusUseCase(forms, views, clock),
      inject: [FormRepository, FormViews, Clock],
    },
    {
      provide: DeleteFormUseCase,
      useFactory: (
        forms: FormRepository,
        storage: FormImageStorage,
        clock: Clock,
        invitations: FormInvitationRepository,
      ) => new DeleteFormUseCase(forms, storage, clock, invitations),
      inject: [FormRepository, FormImageStorage, Clock, FormInvitationRepository],
    },
    {
      provide: RequestHeaderImageUploadUseCase,
      useFactory: (
        forms: FormRepository,
        storage: FormImageStorage,
        ids: IdGenerator,
        clock: Clock,
      ) => new RequestHeaderImageUploadUseCase(forms, storage, ids, clock),
      inject: [FormRepository, FormImageStorage, IdGenerator, Clock],
    },
    {
      provide: CompleteHeaderImageUploadUseCase,
      useFactory: (
        forms: FormRepository,
        storage: FormImageStorage,
        processor: HeaderImageProcessor,
        views: FormViews,
        ids: IdGenerator,
        clock: Clock,
      ) => new CompleteHeaderImageUploadUseCase(forms, storage, processor, views, ids, clock),
      inject: [
        FormRepository,
        FormImageStorage,
        HeaderImageProcessor,
        FormViews,
        IdGenerator,
        Clock,
      ],
    },
    {
      provide: RemoveHeaderImageUseCase,
      useFactory: (
        forms: FormRepository,
        storage: FormImageStorage,
        views: FormViews,
        clock: Clock,
      ) => new RemoveHeaderImageUseCase(forms, storage, views, clock),
      inject: [FormRepository, FormImageStorage, FormViews, Clock],
    },
  ],
})
export class FormsModule {}
