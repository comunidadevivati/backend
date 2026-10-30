import { Body, Controller, Delete, HttpCode, Inject, Param, Post, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { ProblemException } from '../../../shared/presentation/problem-details.js';
import { parseOrThrow } from '../../../shared/presentation/request-parsing.js';
import { ServiceTokenGuard } from '../../../shared/presentation/service-token.guard.js';
import {
  PurgeAnswersUseCase,
  RecordDeliveryEventUseCase,
} from '../application/delivery-and-purge.use-cases.js';
import { throwInvalidFields, unwrap } from './forms-problem.js';
import { deliveryEventSchema } from './forms-request.schemas.js';
import type { FormView } from '../application/form-views.js';

// Eventos de entrega dos e-mails (repassados pelo BFF a partir do webhook do Resend).
@Controller('form-email-events')
@UseGuards(ServiceTokenGuard)
export class FormEmailEventsController {
  constructor(
    @Inject(RecordDeliveryEventUseCase)
    private readonly recordEvent: RecordDeliveryEventUseCase,
  ) {}

  @Post()
  @HttpCode(204)
  async record(@Body() body: unknown): Promise<void> {
    const { messageId, occurredAt, status } = parseOrThrow(
      deliveryEventSchema,
      body,
      throwInvalidFields,
    );

    await this.recordEvent.execute(messageId, status, occurredAt);
  }
}

// Exclusão do conteúdo das respostas (LGPD), só com o formulário finalizado ou cancelado.
@Controller('forms/:id/answers')
@UseGuards(ServiceTokenGuard)
export class FormAnswersPurgeController {
  constructor(@Inject(PurgeAnswersUseCase) private readonly purge: PurgeAnswersUseCase) {}

  @Delete()
  @HttpCode(200)
  async delete(@Param('id') id: string): Promise<FormView> {
    if (!z.uuid().safeParse(id).success) {
      throw new ProblemException(404, 'Formulário não encontrado.');
    }

    return unwrap(await this.purge.execute(id));
  }
}
