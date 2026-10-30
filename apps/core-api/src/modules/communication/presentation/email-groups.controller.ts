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
  CreateEmailGroupUseCase,
  DeleteEmailGroupUseCase,
  GetEmailGroupUseCase,
  ListEmailGroupsUseCase,
  UpdateEmailGroupUseCase,
  type CommunicationError,
  type EmailGroupSummary,
} from '../application/email-group.use-cases.js';
import type { Result } from '../../../shared/domain/result.js';
import type { EmailGroupSnapshot } from '../domain/email-group.js';

// Transporte: somente tipos e limites de tamanho; as regras ficam no Domain.
const text = z.string().max(2500);

const groupSchema = z.strictObject({
  name: text,
  description: text.nullable().default(null),
  memberAccountIds: z.array(z.string().max(64)).max(10_000).default([]),
});

const updateGroupSchema = groupSchema.extend({ version: z.number().int().min(1) });

const throwInvalidFields = (fields: string[]): never => {
  throw new ProblemException(400, 'Dados inválidos.', fields);
};

// Um ID fora do formato UUID não pode existir: responde como inexistente.
const parseId = (id: string): string => {
  if (!z.uuid().safeParse(id).success) {
    throw new ProblemException(404, 'Grupo de e-mails não encontrado.');
  }

  return id;
};

const toProblem = (error: CommunicationError): ProblemException => {
  switch (error.type) {
    case 'not_found':
      return new ProblemException(404, 'Grupo de e-mails não encontrado.');

    case 'invalid_fields':
      return new ProblemException(400, 'Dados inválidos.', error.fields);

    case 'name_taken':
      return new ProblemException(409, 'Já existe um grupo de e-mails com este nome.', ['name']);

    default:
      return new ProblemException(
        409,
        'O grupo foi alterado por outra operação. Recarregue os dados e tente novamente.',
      );
  }
};

const unwrap = <T>(result: Result<T, CommunicationError>): T => {
  if (!result.ok) {
    throw toProblem(result.error);
  }

  return result.value;
};

// Grupos de e-mails (ADR 0013), chamados somente pelo BFF com a credencial de serviço.
@Controller('email-groups')
@UseGuards(ServiceTokenGuard)
export class EmailGroupsController {
  constructor(
    @Inject(ListEmailGroupsUseCase)
    private readonly listGroups: ListEmailGroupsUseCase,
    @Inject(GetEmailGroupUseCase)
    private readonly getGroup: GetEmailGroupUseCase,
    @Inject(CreateEmailGroupUseCase)
    private readonly createGroup: CreateEmailGroupUseCase,
    @Inject(UpdateEmailGroupUseCase)
    private readonly updateGroup: UpdateEmailGroupUseCase,
    @Inject(DeleteEmailGroupUseCase)
    private readonly deleteGroup: DeleteEmailGroupUseCase,
  ) {}

  // Todos os grupos, em ordem alfabética (são poucos: sem paginação).
  @Get()
  list(): Promise<{ items: EmailGroupSummary[] }> {
    return this.listGroups.execute();
  }

  @Post()
  async create(@Body() body: unknown): Promise<EmailGroupSnapshot> {
    return unwrap(
      await this.createGroup.execute(parseOrThrow(groupSchema, body, throwInvalidFields)),
    );
  }

  @Get(':id')
  async get(@Param('id') id: string): Promise<EmailGroupSnapshot> {
    return unwrap(await this.getGroup.execute(parseId(id)));
  }

  // Substituição completa com controle otimista: `version` deve ser a versão lida.
  @Put(':id')
  async update(@Param('id') id: string, @Body() body: unknown): Promise<EmailGroupSnapshot> {
    const groupId = parseId(id);

    const input = parseOrThrow(updateGroupSchema, body, throwInvalidFields);

    return unwrap(await this.updateGroup.execute({ id: groupId, ...input }));
  }

  @Delete(':id')
  @HttpCode(204)
  async delete(@Param('id') id: string): Promise<void> {
    unwrap(await this.deleteGroup.execute(parseId(id)));
  }
}
