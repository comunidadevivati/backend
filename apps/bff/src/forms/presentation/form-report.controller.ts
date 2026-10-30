import {
  BadGatewayException,
  Controller,
  ForbiddenException,
  Get,
  Header,
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
import { CoreApiForwarder } from '../../core-api/presentation/core-api-forwarder.service.js';
import { resourcePath } from '../../core-api/presentation/forwarding.js';
import {
  FormReportExportService,
  type ExportResult,
} from '../application/form-report-export.service.js';
import type { FastifyReply, FastifyRequest } from 'fastify';

// Relatório consolidado do formulário (ADR 0013): dados para a tela, CSV para o Excel e PDF.
@Controller('api/v1/forms/:id')
export class FormReportController {
  constructor(
    @Inject(CoreApiForwarder) private readonly forwarder: CoreApiForwarder,
    @Inject(SessionCookieService) private readonly sessionCookies: SessionCookieService,
    @Inject(FormReportExportService) private readonly exports: FormReportExportService,
  ) {}

  @Get('report')
  @Header('Cache-Control', 'no-store')
  report(
    @Param('id') id: string,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    return this.forwarder.forward(request, reply, {
      write: false,
      method: 'GET',
      path: resourcePath('forms', id, 'report'),
    });
  }

  // Baixado como arquivo.
  @Get('report.csv')
  async csv(
    @Param('id') id: string,
    @Req() request: FastifyRequest,
    @Res() reply: FastifyReply,
  ): Promise<void> {
    await this.send(request, reply, id, 'attachment', (formId) => this.exports.csv(formId));
  }

  // Aberto no visualizador de PDF do navegador.
  @Get('report.pdf')
  async pdf(
    @Param('id') id: string,
    @Req() request: FastifyRequest,
    @Res() reply: FastifyReply,
  ): Promise<void> {
    await this.send(request, reply, id, 'inline', (formId) => this.exports.pdf(formId));
  }

  private async send(
    request: FastifyRequest,
    reply: FastifyReply,
    id: string,
    disposition: 'attachment' | 'inline',
    render: (formId: string) => Promise<ExportResult>,
  ): Promise<void> {
    const { session } = await this.sessionCookies.requireSession(request);

    if (!session.emailVerified) {
      throw new ForbiddenException('Confirme seu e-mail para acessar este recurso.');
    }

    if (!z.uuid().safeParse(id).success) {
      throw new NotFoundException('Formulário não encontrado.');
    }

    let result;

    try {
      result = await render(id);
    } catch (error) {
      if (error instanceof CoreApiUnavailableError) {
        throw new ServiceUnavailableException('Serviço temporariamente indisponível.');
      }

      throw error;
    }

    if (result.status === 'not_found') {
      throw new NotFoundException('Formulário não encontrado.');
    }

    if (result.status === 'unavailable') {
      throw new BadGatewayException('Falha ao processar a solicitação.');
    }

    await reply
      .header('Content-Type', result.contentType)
      .header(
        'Content-Disposition',
        `${disposition}; filename*=UTF-8''${encodeURIComponent(result.filename)}`,
      )
      .header('Cache-Control', 'private, no-store')
      .send(Buffer.from(result.content));
  }
}
