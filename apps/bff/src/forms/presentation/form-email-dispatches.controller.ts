import {
  BadGatewayException,
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Header,
  Inject,
  Param,
  Post,
  Req,
  Res,
  ServiceUnavailableException,
} from '@nestjs/common';
import { z } from 'zod';
import { SessionCookieService } from '../../auth/presentation/session-cookie.service.js';
import {
  CoreApiClient,
  CoreApiUnavailableError,
} from '../../core-api/infrastructure/core-api.client.js';
import { CoreApiForwarder } from '../../core-api/presentation/core-api-forwarder.service.js';
import { resourcePath } from '../../core-api/presentation/forwarding.js';
import { AnswersCopyService } from '../application/answers-copy.service.js';
import {
  FormEmailDispatchService,
  type StartedDispatch,
} from '../application/form-email-dispatch.service.js';
import { PublicRateLimiter } from './public-rate-limiter.js';
import type { FastifyReply, FastifyRequest } from 'fastify';

// Convite (padrão) ou lembrete aos pendentes, com mensagem opcional exibida no e-mail.
const startSchema = z.strictObject({
  kind: z.enum(['INVITE', 'REMINDER']).default('INVITE'),
  message: z.string().trim().max(1000).nullable().default(null),
});

// Na resposta pelo link, a pessoa pode pedir uma cópia das respostas por e-mail.
const answersBodySchema = z.object({ sendCopy: z.boolean().default(false) }).loose();

// Envio dos e-mails de um formulário aos grupos (ADR 0013). Responde 202 assim que o envio começa;
// o formulário fica com o envio em andamento ("SENDING") até a conclusão, feita em segundo plano.
@Controller('api/v1/forms')
export class FormEmailDispatchesController {
  constructor(
    @Inject(SessionCookieService) private readonly sessionCookies: SessionCookieService,
    @Inject(CoreApiClient) private readonly coreApi: CoreApiClient,
    @Inject(FormEmailDispatchService) private readonly dispatches: FormEmailDispatchService,
  ) {}

  @Post(':id/email-dispatches')
  @Header('Cache-Control', 'no-store')
  async start(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<unknown> {
    const { session } = await this.sessionCookies.requireSession(request);

    if (!session.emailVerified) {
      throw new ForbiddenException('Confirme seu e-mail para acessar este recurso.');
    }

    this.sessionCookies.assertCsrfToken(request, session);

    const options = startSchema.safeParse(body ?? {});

    if (!options.success) {
      throw new BadRequestException({ message: 'Dados inválidos.', fields: ['message'] });
    }

    let response;

    try {
      response = await this.coreApi.send({
        method: 'POST',
        path: resourcePath('forms', id, 'email-dispatches'),
        body: { kind: options.data.kind },
      });
    } catch (error) {
      if (error instanceof CoreApiUnavailableError) {
        void this.coreApi.wake();

        throw new ServiceUnavailableException('Serviço temporariamente indisponível.');
      }

      throw error;
    }

    if (response.status === 401 || response.status >= 500) {
      throw new BadGatewayException('Falha ao processar a solicitação.');
    }

    // Recusas da Core API (404, 409...) seguem com o Problem Details.
    if (response.status !== 201) {
      void reply.status(response.status).header('Content-Type', response.contentType);

      return response.body;
    }

    const started = response.body as StartedDispatch;

    this.dispatches.run(started, options.data);

    void reply.status(202);

    return started.form;
  }
}

// Resposta pelo link do e-mail (sem sessão): o token vai no corpo e é validado pela Core API. As
// rotas têm limite de requisições por endereço de origem.
@Controller('api/v1/public/form-invitations')
export class PublicFormInvitationsController {
  constructor(
    @Inject(CoreApiForwarder) private readonly forwarder: CoreApiForwarder,
    @Inject(PublicRateLimiter) private readonly limiter: PublicRateLimiter,
    @Inject(AnswersCopyService) private readonly copies: AnswersCopyService,
  ) {}

  @Post('lookup')
  @Header('Cache-Control', 'no-store')
  lookup(
    @Body() body: unknown,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    this.limiter.check(request, 'lookup');

    return this.forwarder.forwardWithBodyCredential(reply, {
      path: 'public/form-invitations/lookup',
      body: body ?? {},
    });
  }

  @Post('answers')
  @Header('Cache-Control', 'no-store')
  async answers(
    @Body() body: unknown,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    this.limiter.check(request, 'answers');

    const { sendCopy, ...answer } = answersBodySchema.parse(body ?? {});

    const result = await this.forwarder.forwardWithBodyCredential(reply, {
      path: 'public/form-invitations/answers',
      body: answer,
    });

    // Cópia por e-mail em segundo plano: a resposta já foi registrada, a falha só fica no log.
    if (sendCopy && reply.statusCode === 200) {
      this.copies.send(result, answer);
    }

    return result;
  }
}
