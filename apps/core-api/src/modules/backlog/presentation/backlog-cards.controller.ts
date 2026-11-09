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
  CreateBacklogCardUseCase,
  DeleteBacklogCardUseCase,
  ListBacklogCardsUseCase,
  MoveBacklogCardUseCase,
  UpdateBacklogCardUseCase,
  type BacklogError,
} from '../application/backlog-card.use-cases.js';
import {
  BACKLOG_CARD_STATUSES,
  BACKLOG_CARD_TYPES,
  type BacklogCardSnapshot,
} from '../domain/backlog-card.js';
import type { Result } from '../../../shared/domain/result.js';

// Transporte: somente tipos e limites de tamanho; as regras ficam no Domain.
const text = z.string().max(6000);

const version = z.number().int().min(1);

const cardSchema = z.strictObject({
  title: text,
  description: text,
  type: z.enum(BACKLOG_CARD_TYPES),
});

const createCardSchema = cardSchema.extend({
  status: z.enum(BACKLOG_CARD_STATUSES).default('CREATED'),
});

const updateCardSchema = cardSchema.extend({ version });

const moveCardSchema = z.strictObject({ status: z.enum(BACKLOG_CARD_STATUSES), version });

const throwInvalidFields = (fields: string[]): never => {
  throw new ProblemException(400, 'Dados inválidos.', fields);
};

// Um ID fora do formato UUID não pode existir: responde como inexistente.
const parseId = (id: string): string => {
  if (!z.uuid().safeParse(id).success) {
    throw new ProblemException(404, 'Card não encontrado.');
  }

  return id;
};

const toProblem = (error: BacklogError): ProblemException => {
  switch (error.type) {
    case 'not_found':
      return new ProblemException(404, 'Card não encontrado.');

    case 'invalid_fields':
      return new ProblemException(400, 'Dados inválidos.', error.fields);

    case 'same_status':
      return new ProblemException(409, 'O card já está nesta etapa.', ['status']);

    default:
      return new ProblemException(
        409,
        'O card foi alterado por outra operação. Recarregue os dados e tente novamente.',
      );
  }
};

const unwrap = <T>(result: Result<T, BacklogError>): T => {
  if (!result.ok) {
    throw toProblem(result.error);
  }

  return result.value;
};

// Cards do backlog (ADR 0014), chamados somente pelo BFF com a credencial de serviço.
@Controller('backlog-cards')
@UseGuards(ServiceTokenGuard)
export class BacklogCardsController {
  constructor(
    @Inject(ListBacklogCardsUseCase)
    private readonly listCards: ListBacklogCardsUseCase,
    @Inject(CreateBacklogCardUseCase)
    private readonly createCard: CreateBacklogCardUseCase,
    @Inject(UpdateBacklogCardUseCase)
    private readonly updateCard: UpdateBacklogCardUseCase,
    @Inject(MoveBacklogCardUseCase)
    private readonly moveCard: MoveBacklogCardUseCase,
    @Inject(DeleteBacklogCardUseCase)
    private readonly deleteCard: DeleteBacklogCardUseCase,
  ) {}

  // Todos os cards: o quadro mostra todas as etapas de uma vez, por isso sem paginação.
  @Get()
  list(): Promise<{ items: BacklogCardSnapshot[] }> {
    return this.listCards.execute();
  }

  @Post()
  async create(@Body() body: unknown): Promise<BacklogCardSnapshot> {
    return unwrap(
      await this.createCard.execute(parseOrThrow(createCardSchema, body, throwInvalidFields)),
    );
  }

  // Substituição dos dados com controle otimista: `version` deve ser a versão lida.
  @Put(':id')
  async update(@Param('id') id: string, @Body() body: unknown): Promise<BacklogCardSnapshot> {
    const cardId = parseId(id);

    const input = parseOrThrow(updateCardSchema, body, throwInvalidFields);

    return unwrap(await this.updateCard.execute({ id: cardId, ...input }));
  }

  @Put(':id/status')
  async move(@Param('id') id: string, @Body() body: unknown): Promise<BacklogCardSnapshot> {
    const cardId = parseId(id);

    const input = parseOrThrow(moveCardSchema, body, throwInvalidFields);

    return unwrap(await this.moveCard.execute({ id: cardId, ...input }));
  }

  @Delete(':id')
  @HttpCode(204)
  async delete(@Param('id') id: string): Promise<void> {
    unwrap(await this.deleteCard.execute(parseId(id)));
  }
}
