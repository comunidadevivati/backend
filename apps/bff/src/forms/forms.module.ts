import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ResendEmailClient } from '../auth/infrastructure/email/resend-email.client.js';
import { SessionService } from '../auth/infrastructure/session/session.service.js';
import { UserAccountRepository } from '../auth/infrastructure/users/user-account.repository.js';
import { SessionCookieService } from '../auth/presentation/session-cookie.service.js';
import { CoreApiModule } from '../core-api/core-api.module.js';
import { AnswersCopyService } from './application/answers-copy.service.js';
import { FormAnswersPdfService } from './application/form-answers-pdf.service.js';
import { FormEmailDispatchService } from './application/form-email-dispatch.service.js';
import { FormInvitationEmailSender } from './application/form-invitation-email-sender.js';
import { FormPrintout } from './application/form-printout.js';
import { FormReportExportService } from './application/form-report-export.service.js';
import { FormReportPrintout } from './application/form-report-printout.js';
import {
  DisabledFormInvitationEmailSender,
  ResendFormInvitationEmailSender,
} from './infrastructure/form-invitation-email.senders.js';
import { PdfkitFormPrintout } from './infrastructure/pdfkit-form-printout.js';
import { PdfkitFormReport } from './infrastructure/pdfkit-form-report.js';
import { FormAnswersPdfController } from './presentation/form-answers-pdf.controller.js';
import {
  FormEmailDispatchesController,
  PublicFormInvitationsController,
} from './presentation/form-email-dispatches.controller.js';
import { FormInvitationsController } from './presentation/form-invitations.controller.js';
import { FormReportController } from './presentation/form-report.controller.js';
import { DepartmentFormsController, FormsController } from './presentation/forms.controllers.js';
import { PublicRateLimiter } from './presentation/public-rate-limiter.js';
import { ResendWebhookController } from './presentation/resend-webhook.controller.js';

// Rotas web dos formulários dos departamentos (ADR 0013), encaminhadas à Core API, o envio dos
// e-mails aos grupos e a resposta pelo link (pública).
@Module({
  imports: [CoreApiModule],
  controllers: [
    DepartmentFormsController,
    FormsController,
    FormEmailDispatchesController,
    PublicFormInvitationsController,
    FormInvitationsController,
    FormAnswersPdfController,
    FormReportController,
    ResendWebhookController,
  ],
  providers: [
    FormEmailDispatchService,
    FormAnswersPdfService,
    AnswersCopyService,
    PublicRateLimiter,
    FormReportExportService,
    { provide: FormReportPrintout, useClass: PdfkitFormReport },
    { provide: FormPrintout, useClass: PdfkitFormPrintout },
    UserAccountRepository,
    SessionService,
    SessionCookieService,
    ResendEmailClient,
    ResendFormInvitationEmailSender,
    DisabledFormInvitationEmailSender,
    {
      provide: FormInvitationEmailSender,
      inject: [ConfigService, ResendFormInvitationEmailSender, DisabledFormInvitationEmailSender],
      useFactory: (
        configService: ConfigService,
        resendSender: ResendFormInvitationEmailSender,
        disabledSender: DisabledFormInvitationEmailSender,
      ) =>
        configService.getOrThrow<string>('EMAIL_PROVIDER') === 'resend'
          ? resendSender
          : disabledSender,
    },
  ],
})
export class FormsModule {}
