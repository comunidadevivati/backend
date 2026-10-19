import { Body, Controller, Get, HttpCode, Inject, Patch, Post, UseGuards } from '@nestjs/common';
import { ServiceTokenGuard } from '../../../shared/presentation/service-token.guard.js';
import {
  ChangeOrganizationStatusUseCase,
  GetOrganizationUseCase,
  UpdateOrganizationUseCase,
} from '../application/organization.use-cases.js';
import { throwInvalidFields, unwrap } from './organization-problem.js';
import { parseOrThrow, updateOrganizationSchema } from './organization-request.schemas.js';
import type { OrganizationSnapshot } from '../domain/organization.js';

// Organização principal (Matriz). Não há criação nem exclusão: a raiz nasce na migration inicial.
@Controller('organization')
@UseGuards(ServiceTokenGuard)
export class OrganizationController {
  constructor(
    @Inject(GetOrganizationUseCase)
    private readonly getOrganization: GetOrganizationUseCase,
    @Inject(UpdateOrganizationUseCase)
    private readonly updateOrganization: UpdateOrganizationUseCase,
    @Inject(ChangeOrganizationStatusUseCase)
    private readonly changeStatus: ChangeOrganizationStatusUseCase,
  ) {}

  @Get()
  async get(): Promise<OrganizationSnapshot> {
    return unwrap(await this.getOrganization.execute());
  }

  // Alteração parcial com controle otimista: `version` deve ser a versão lida.
  @Patch()
  async update(@Body() body: unknown): Promise<OrganizationSnapshot> {
    const { version, ...patch } = parseOrThrow(updateOrganizationSchema, body, throwInvalidFields);

    return unwrap(await this.updateOrganization.execute({ expectedVersion: version, patch }));
  }

  @Post('activate')
  @HttpCode(200)
  async activate(): Promise<OrganizationSnapshot> {
    return unwrap(await this.changeStatus.execute('activate'));
  }

  @Post('deactivate')
  @HttpCode(200)
  async deactivate(): Promise<OrganizationSnapshot> {
    return unwrap(await this.changeStatus.execute('deactivate'));
  }
}
