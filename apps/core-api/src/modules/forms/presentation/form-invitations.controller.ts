import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Param,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { z } from 'zod';
import { ProblemException } from '../../../shared/presentation/problem-details.js';
import { parseOrThrow } from '../../../shared/presentation/request-parsing.js';
import { ServiceTokenGuard } from '../../../shared/presentation/service-token.guard.js';
import {
  CompletePaperAttachmentUploadUseCase,
  GetPaperAttachmentUrlUseCase,
  ListInvitationsUseCase,
  MarkPaperAnswerUseCase,
  RequestPaperAttachmentUploadUseCase,
  UnmarkPaperAnswerUseCase,
  type InvitationAdminView,
  type PaperAttachmentUploadTicket,
} from '../application/paper-answer.use-cases.js';
import { throwInvalidFields, unwrap } from './forms-problem.js';
import {
  completePaperAttachmentUploadSchema,
  requestPaperAttachmentUploadSchema,
} from './forms-request.schemas.js';

// Um ID fora do formato UUID não pode existir: responde como inexistente.
const parseId = (id: string): string => {
  if (!z.uuid().safeParse(id).success) {
    throw new ProblemException(404, 'Registro não encontrado.');
  }

  return id;
};

// Respostas do formulário no painel (ADR 0013): convites, respostas digitais e respostas em papel.
@Controller('forms/:id/invitations')
@UseGuards(ServiceTokenGuard)
export class FormInvitationsController {
  constructor(
    @Inject(ListInvitationsUseCase)
    private readonly listInvitations: ListInvitationsUseCase,
    @Inject(MarkPaperAnswerUseCase)
    private readonly markPaper: MarkPaperAnswerUseCase,
    @Inject(UnmarkPaperAnswerUseCase)
    private readonly unmarkPaper: UnmarkPaperAnswerUseCase,
    @Inject(RequestPaperAttachmentUploadUseCase)
    private readonly requestUpload: RequestPaperAttachmentUploadUseCase,
    @Inject(CompletePaperAttachmentUploadUseCase)
    private readonly completeUpload: CompletePaperAttachmentUploadUseCase,
    @Inject(GetPaperAttachmentUrlUseCase)
    private readonly attachmentUrl: GetPaperAttachmentUrlUseCase,
  ) {}

  // Em ordem alfabética do nome, com as respostas.
  @Get()
  async list(@Param('id') id: string): Promise<{ items: InvitationAdminView[] }> {
    return unwrap(await this.listInvitations.execute(parseId(id)));
  }

  @Put(':invitationId/paper-answer')
  async mark(
    @Param('id') id: string,
    @Param('invitationId') invitationId: string,
  ): Promise<InvitationAdminView> {
    return unwrap(await this.markPaper.execute(parseId(id), parseId(invitationId)));
  }

  @Delete(':invitationId/paper-answer')
  @HttpCode(200)
  async unmark(
    @Param('id') id: string,
    @Param('invitationId') invitationId: string,
  ): Promise<InvitationAdminView> {
    return unwrap(await this.unmarkPaper.execute(parseId(id), parseId(invitationId)));
  }

  // URL para o navegador enviar o anexo direto ao bucket; depois, PUT .../paper-attachment confirma.
  @Post(':invitationId/paper-attachment/uploads')
  async upload(
    @Param('id') id: string,
    @Param('invitationId') invitationId: string,
    @Body() body: unknown,
  ): Promise<PaperAttachmentUploadTicket> {
    const { contentType } = parseOrThrow(
      requestPaperAttachmentUploadSchema,
      body,
      throwInvalidFields,
    );

    return unwrap(
      await this.requestUpload.execute(parseId(id), parseId(invitationId), contentType),
    );
  }

  @Put(':invitationId/paper-attachment')
  async complete(
    @Param('id') id: string,
    @Param('invitationId') invitationId: string,
    @Body() body: unknown,
  ): Promise<InvitationAdminView> {
    const input = parseOrThrow(completePaperAttachmentUploadSchema, body, throwInvalidFields);

    return unwrap(await this.completeUpload.execute(parseId(id), parseId(invitationId), input));
  }

  @Get(':invitationId/paper-attachment')
  async download(
    @Param('id') id: string,
    @Param('invitationId') invitationId: string,
  ): Promise<{ url: string }> {
    return unwrap(await this.attachmentUrl.execute(parseId(id), parseId(invitationId)));
  }
}
