import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Inject,
  NotFoundException,
  Param,
  Post,
  Put,
  Req,
  Res,
} from '@nestjs/common';
import { z } from 'zod';
import { CoreApiForwarder } from '../../core-api/presentation/core-api-forwarder.service.js';
import { resourcePath } from '../../core-api/presentation/forwarding.js';
import type { FastifyReply, FastifyRequest } from 'fastify';

// Caminho do convite na Core API; o ID do convite também precisa ser UUID.
const invitationPath = (formId: string, invitationId: string, ...rest: string[]): string => {
  if (!z.uuid().safeParse(invitationId).success) {
    throw new NotFoundException('Registro não encontrado.');
  }

  return resourcePath('forms', formId, 'invitations', invitationId, ...rest);
};

// Respostas do formulário no painel (ADR 0013), encaminhadas à Core API. O anexo da resposta em
// papel vai direto ao bucket de mídia pela URL devolvida em /paper-attachment/uploads.
@Controller('api/v1/forms/:id/invitations')
export class FormInvitationsController {
  constructor(@Inject(CoreApiForwarder) private readonly forwarder: CoreApiForwarder) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  list(
    @Param('id') id: string,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    return this.forwarder.forward(request, reply, {
      write: false,
      method: 'GET',
      path: resourcePath('forms', id, 'invitations'),
    });
  }

  @Put(':invitationId/paper-answer')
  @Header('Cache-Control', 'no-store')
  mark(
    @Param('id') id: string,
    @Param('invitationId') invitationId: string,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    return this.forwarder.forward(request, reply, {
      write: true,
      method: 'PUT',
      path: invitationPath(id, invitationId, 'paper-answer'),
    });
  }

  @Delete(':invitationId/paper-answer')
  @Header('Cache-Control', 'no-store')
  unmark(
    @Param('id') id: string,
    @Param('invitationId') invitationId: string,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    return this.forwarder.forward(request, reply, {
      write: true,
      method: 'DELETE',
      path: invitationPath(id, invitationId, 'paper-answer'),
    });
  }

  @Post(':invitationId/paper-attachment/uploads')
  @Header('Cache-Control', 'no-store')
  upload(
    @Param('id') id: string,
    @Param('invitationId') invitationId: string,
    @Body() body: unknown,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    return this.forwarder.forward(request, reply, {
      write: true,
      method: 'POST',
      path: invitationPath(id, invitationId, 'paper-attachment', 'uploads'),
      body: body ?? {},
    });
  }

  @Put(':invitationId/paper-attachment')
  @Header('Cache-Control', 'no-store')
  complete(
    @Param('id') id: string,
    @Param('invitationId') invitationId: string,
    @Body() body: unknown,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    return this.forwarder.forward(request, reply, {
      write: true,
      method: 'PUT',
      path: invitationPath(id, invitationId, 'paper-attachment'),
      body: body ?? {},
    });
  }

  // URL de download de validade curta.
  @Get(':invitationId/paper-attachment')
  @Header('Cache-Control', 'no-store')
  download(
    @Param('id') id: string,
    @Param('invitationId') invitationId: string,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    return this.forwarder.forward(request, reply, {
      write: false,
      method: 'GET',
      path: invitationPath(id, invitationId, 'paper-attachment'),
    });
  }
}
