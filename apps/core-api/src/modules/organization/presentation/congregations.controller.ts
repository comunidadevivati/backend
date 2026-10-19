import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ProblemException } from '../../../shared/presentation/problem-details.js';
import { ServiceTokenGuard } from '../../../shared/presentation/service-token.guard.js';
import {
  ChangeCongregationStatusUseCase,
  GetCongregationUseCase,
  ListCongregationsUseCase,
  RegisterCongregationUseCase,
  UpdateCongregationUseCase,
  type CongregationPage,
} from '../application/congregation.use-cases.js';
import { throwInvalidFields, unwrap } from './organization-problem.js';
import {
  congregationIdSchema,
  listCongregationsSchema,
  parseOrThrow,
  registerCongregationSchema,
  updateCongregationSchema,
} from './organization-request.schemas.js';
import type { StatusAction } from '../application/organization.use-cases.js';
import type { CongregationSnapshot } from '../domain/congregation.js';

// Um ID fora do formato UUID não pode existir: responde como inexistente.
const parseId = (id: string): string => {
  if (!congregationIdSchema.safeParse(id).success) {
    throw new ProblemException(404, 'Registro não encontrado.');
  }

  return id;
};

@Controller('congregations')
@UseGuards(ServiceTokenGuard)
export class CongregationsController {
  constructor(
    @Inject(ListCongregationsUseCase)
    private readonly listCongregations: ListCongregationsUseCase,
    @Inject(GetCongregationUseCase)
    private readonly getCongregation: GetCongregationUseCase,
    @Inject(RegisterCongregationUseCase)
    private readonly registerCongregation: RegisterCongregationUseCase,
    @Inject(UpdateCongregationUseCase)
    private readonly updateCongregation: UpdateCongregationUseCase,
    @Inject(ChangeCongregationStatusUseCase)
    private readonly changeStatus: ChangeCongregationStatusUseCase,
  ) {}

  // Filtros: status (DRAFT | ACTIVE | INACTIVE), cursor (nextCursor da página anterior) e limit.
  @Get()
  async list(@Query() query: unknown): Promise<CongregationPage> {
    const filters = parseOrThrow(listCongregationsSchema, query, throwInvalidFields);

    return this.listCongregations.execute(filters);
  }

  @Get(':id')
  async get(@Param('id') id: string): Promise<CongregationSnapshot> {
    return unwrap(await this.getCongregation.execute(parseId(id)));
  }

  // A congregação nasce DRAFT; use /activate para colocá-la em funcionamento.
  @Post()
  async register(@Body() body: unknown): Promise<CongregationSnapshot> {
    return unwrap(
      await this.registerCongregation.execute(
        parseOrThrow(registerCongregationSchema, body, throwInvalidFields),
      ),
    );
  }

  // Alteração parcial com controle otimista: `version` deve ser a versão lida. O código
  // institucional é estável e não pode ser alterado.
  @Patch(':id')
  async update(@Param('id') id: string, @Body() body: unknown): Promise<CongregationSnapshot> {
    const { version, ...patch } = parseOrThrow(updateCongregationSchema, body, throwInvalidFields);

    return unwrap(
      await this.updateCongregation.execute({ id: parseId(id), expectedVersion: version, patch }),
    );
  }

  @Post(':id/activate')
  @HttpCode(200)
  activate(@Param('id') id: string): Promise<CongregationSnapshot> {
    return this.change(id, 'activate');
  }

  @Post(':id/deactivate')
  @HttpCode(200)
  deactivate(@Param('id') id: string): Promise<CongregationSnapshot> {
    return this.change(id, 'deactivate');
  }

  private async change(id: string, action: StatusAction): Promise<CongregationSnapshot> {
    return unwrap(await this.changeStatus.execute({ id: parseId(id), action }));
  }
}
