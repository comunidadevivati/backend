import { Body, Controller, HttpCode, Inject, Param, Post, Put, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { ProblemException } from '../../../shared/presentation/problem-details.js';
import { parseOrThrow } from '../../../shared/presentation/request-parsing.js';
import { ServiceTokenGuard } from '../../../shared/presentation/service-token.guard.js';
import {
  FinishEmailDispatchUseCase,
  PrepareInvitationsUseCase,
  StartEmailDispatchUseCase,
  type InvitationLink,
  type StartedDispatch,
} from '../application/email-dispatch.use-cases.js';
import {
  LookupInvitationUseCase,
  SubmitAnswersUseCase,
  type InvitationView,
} from '../application/invitation-answer.use-cases.js';
import { throwInvalidFields, unwrap } from './forms-problem.js';
import {
  finishDispatchSchema,
  startDispatchSchema,
  lookupInvitationSchema,
  prepareInvitationsSchema,
  submitAnswersSchema,
} from './forms-request.schemas.js';
import type { FormView } from '../application/form-views.js';

// Um ID fora do formato UUID não pode existir: responde como inexistente.
const parseId = (id: string): string => {
  if (!z.uuid().safeParse(id).success) {
    throw new ProblemException(404, 'Formulário não encontrado.');
  }

  return id;
};

// Envio dos e-mails aos grupos (ADR 0013), conduzido pelo BFF: iniciar, preparar convites, concluir.
@Controller('forms/:id/email-dispatches')
@UseGuards(ServiceTokenGuard)
export class FormEmailDispatchesController {
  constructor(
    @Inject(StartEmailDispatchUseCase)
    private readonly startDispatch: StartEmailDispatchUseCase,
    @Inject(PrepareInvitationsUseCase)
    private readonly prepareInvitations: PrepareInvitationsUseCase,
    @Inject(FinishEmailDispatchUseCase)
    private readonly finishDispatch: FinishEmailDispatchUseCase,
  ) {}

  // Bloqueia o formulário e devolve as contas dos grupos destinatários.
  @Post()
  async start(@Param('id') id: string, @Body() body: unknown): Promise<StartedDispatch> {
    const formId = parseId(id);

    const { kind } = parseOrThrow(startDispatchSchema, body, throwInvalidFields);

    return unwrap(await this.startDispatch.execute(formId, kind));
  }

  // Tokens dos links, entregues somente nesta resposta.
  @Post(':dispatchId/invitations')
  @HttpCode(200)
  async invitations(
    @Param('id') id: string,
    @Param('dispatchId') dispatchId: string,
    @Body() body: unknown,
  ): Promise<{ items: InvitationLink[] }> {
    const { recipients } = parseOrThrow(prepareInvitationsSchema, body, throwInvalidFields);

    return {
      items: unwrap(
        await this.prepareInvitations.execute(parseId(id), parseId(dispatchId), recipients),
      ),
    };
  }

  @Put(':dispatchId')
  async finish(
    @Param('id') id: string,
    @Param('dispatchId') dispatchId: string,
    @Body() body: unknown,
  ): Promise<FormView> {
    const result = parseOrThrow(finishDispatchSchema, body, throwInvalidFields);

    return unwrap(await this.finishDispatch.execute(parseId(id), parseId(dispatchId), result));
  }
}

// Resposta pelo link do e-mail, repassada pelo BFF sem sessão. O token vai no corpo, nunca na URL.
@Controller('public/form-invitations')
@UseGuards(ServiceTokenGuard)
export class PublicFormInvitationsController {
  constructor(
    @Inject(LookupInvitationUseCase)
    private readonly lookupInvitation: LookupInvitationUseCase,
    @Inject(SubmitAnswersUseCase)
    private readonly submitAnswers: SubmitAnswersUseCase,
  ) {}

  @Post('lookup')
  @HttpCode(200)
  async lookup(@Body() body: unknown): Promise<InvitationView> {
    const { token } = parseOrThrow(lookupInvitationSchema, body, throwInvalidFields);

    return unwrap(await this.lookupInvitation.execute(token));
  }

  @Post('answers')
  @HttpCode(200)
  async answers(@Body() body: unknown): Promise<InvitationView> {
    const { answers, consentAccepted, token } = parseOrThrow(
      submitAnswersSchema,
      body,
      throwInvalidFields,
    );

    return unwrap(await this.submitAnswers.execute(token, { answers, consentAccepted }));
  }
}
