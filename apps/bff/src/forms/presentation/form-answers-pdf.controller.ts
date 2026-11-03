import {
  BadGatewayException,
  ConflictException,
  Controller,
  ForbiddenException,
  Get,
  Inject,
  NotFoundException,
  Param,
  Req,
  Res,
  ServiceUnavailableException,
} from '@nestjs/common';
import { z } from 'zod';
import { SessionCookieService } from '../../auth/presentation/session-cookie.service.js';
import { CoreApiUnavailableError } from '../../core-api/infrastructure/core-api.client.js';
import {
  FormAnswersPdfService,
  type AnswersPdfResult,
} from '../application/form-answers-pdf.service.js';
import type { FastifyReply, FastifyRequest } from 'fastify';

// PDFs de um formulário (ADR 0013), abertos pelo painel numa nova aba: o navegador exibe no próprio
// visualizador de PDF (ler, baixar, imprimir). Mesma regra de acesso das demais rotas: sessão com
// e-mail verificado.
@Controller('api/v1/forms/:id')
export class FormAnswersPdfController {
  constructor(
    @Inject(SessionCookieService) private readonly sessionCookies: SessionCookieService,
    @Inject(FormAnswersPdfService) private readonly pdfs: FormAnswersPdfService,
  ) {}

  // Formulário em branco para imprimir e preencher à mão.
  @Get('printout.pdf')
  async printout(
    @Param('id') id: string,
    @Req() request: FastifyRequest,
    @Res() reply: FastifyReply,
  ): Promise<void> {
    await this.authorize(request, [id]);

    await this.send(reply, () => this.pdfs.renderBlank(id));
  }

  // Respostas digitais de uma pessoa.
  @Get('invitations/:invitationId/answers.pdf')
  async answers(
    @Param('id') id: string,
    @Param('invitationId') invitationId: string,
    @Req() request: FastifyRequest,
    @Res() reply: FastifyReply,
  ): Promise<void> {
    await this.authorize(request, [id, invitationId]);

    await this.send(reply, () => this.pdfs.render(id, invitationId));
  }

  private async authorize(request: FastifyRequest, ids: string[]): Promise<void> {
    const { session } = await this.sessionCookies.requireSession(request);

    if (!session.emailVerified) {
      throw new ForbiddenException('Confirme seu e-mail para acessar este recurso.');
    }

    if (ids.some((value) => !z.uuid().safeParse(value).success)) {
      throw new NotFoundException('Registro não encontrado.');
    }
  }

  private async send(reply: FastifyReply, render: () => Promise<AnswersPdfResult>): Promise<void> {
    let result;

    try {
      result = await render();
    } catch (error) {
      if (error instanceof CoreApiUnavailableError) {
        throw new ServiceUnavailableException('Serviço temporariamente indisponível.');
      }

      throw error;
    }

    switch (result.status) {
      case 'not_found':
        throw new NotFoundException('Registro não encontrado.');

      case 'not_answered':
        throw new ConflictException('Esta pessoa ainda não respondeu pelo link.');

      case 'anonymous':
        throw new ConflictException('Formulário anônimo: as respostas não são ligadas às pessoas.');

      case 'unavailable':
        throw new BadGatewayException('Falha ao processar a solicitação.');

      default:
        await reply
          .header('Content-Type', 'application/pdf')
          .header(
            'Content-Disposition',
            `inline; filename*=UTF-8''${encodeURIComponent(result.filename)}`,
          )
          .header('Cache-Control', 'private, no-store')
          .send(Buffer.from(result.content));
    }
  }
}
