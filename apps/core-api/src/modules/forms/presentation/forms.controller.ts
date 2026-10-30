import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Param,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ProblemException } from '../../../shared/presentation/problem-details.js';
import { parseOrThrow } from '../../../shared/presentation/request-parsing.js';
import { ServiceTokenGuard } from '../../../shared/presentation/service-token.guard.js';
import { DuplicateFormUseCase } from '../application/duplicate-form.use-case.js';
import {
  GetFormReportUseCase,
  ListFormResponsesUseCase,
  type FormReport,
  type FormResponses,
} from '../application/form-report.use-cases.js';
import {
  ChangeFormStatusUseCase,
  CreateFormUseCase,
  DeleteFormUseCase,
  GetFormsSummaryUseCase,
  GetFormUseCase,
  ListFormsUseCase,
  UpdateFormUseCase,
  type FormPage,
} from '../application/form.use-cases.js';
import {
  CompleteHeaderImageUploadUseCase,
  RemoveHeaderImageUseCase,
  RequestHeaderImageUploadUseCase,
  type HeaderImageUploadTicket,
} from '../application/header-image.use-cases.js';
import { isFormDepartment, type FormStatus } from '../domain/form.js';
import { throwInvalidFields, unwrap } from './forms-problem.js';
import {
  changeStatusSchema,
  completeHeaderImageUploadSchema,
  createFormSchema,
  listFormsSchema,
  requestHeaderImageUploadSchema,
  resourceIdSchema,
  updateFormSchema,
} from './forms-request.schemas.js';
import type { FormView } from '../application/form-views.js';

// Departamento fora do catálogo não tem formulários: responde como inexistente.
const parseDepartment = (department: string): string => {
  if (!isFormDepartment(department)) {
    throw new ProblemException(404, 'Departamento não encontrado.');
  }

  return department;
};

// Um ID fora do formato UUID não pode existir: responde como inexistente.
const parseId = (id: string): string => {
  if (!resourceIdSchema.safeParse(id).success) {
    throw new ProblemException(404, 'Formulário não encontrado.');
  }

  return id;
};

// Formulários dos departamentos (ADR 0013), chamados somente pelo BFF com a credencial de serviço.
@Controller('departments/:department/forms')
@UseGuards(ServiceTokenGuard)
export class DepartmentFormsController {
  constructor(
    @Inject(ListFormsUseCase)
    private readonly listForms: ListFormsUseCase,
    @Inject(GetFormsSummaryUseCase)
    private readonly getSummary: GetFormsSummaryUseCase,
    @Inject(CreateFormUseCase)
    private readonly createForm: CreateFormUseCase,
  ) {}

  // Filtros: status, cursor (nextCursor da página anterior) e limit. Mais recentes primeiro.
  @Get()
  list(@Param('department') department: string, @Query() query: unknown): Promise<FormPage> {
    const code = parseDepartment(department);

    return this.listForms.execute({
      department: code,
      ...parseOrThrow(listFormsSchema, query, throwInvalidFields),
    });
  }

  // Total e quantidade por status (card do painel do departamento).
  @Get('summary')
  summary(
    @Param('department') department: string,
  ): Promise<{ total: number; byStatus: Record<FormStatus, number> }> {
    return this.getSummary.execute(parseDepartment(department));
  }

  // Um formulário novo nasce não publicado ou publicado.
  @Post()
  async create(@Param('department') department: string, @Body() body: unknown): Promise<FormView> {
    const code = parseDepartment(department);

    const input = parseOrThrow(createFormSchema, body, throwInvalidFields);

    return unwrap(await this.createForm.execute({ department: code, ...input }));
  }
}

@Controller('forms')
@UseGuards(ServiceTokenGuard)
export class FormsController {
  constructor(
    @Inject(GetFormUseCase)
    private readonly getForm: GetFormUseCase,
    @Inject(UpdateFormUseCase)
    private readonly updateForm: UpdateFormUseCase,
    @Inject(ChangeFormStatusUseCase)
    private readonly changeStatus: ChangeFormStatusUseCase,
    @Inject(DeleteFormUseCase)
    private readonly deleteForm: DeleteFormUseCase,
    @Inject(RequestHeaderImageUploadUseCase)
    private readonly requestUpload: RequestHeaderImageUploadUseCase,
    @Inject(CompleteHeaderImageUploadUseCase)
    private readonly completeUpload: CompleteHeaderImageUploadUseCase,
    @Inject(RemoveHeaderImageUseCase)
    private readonly removeImage: RemoveHeaderImageUseCase,
    @Inject(DuplicateFormUseCase)
    private readonly duplicateForm: DuplicateFormUseCase,
    @Inject(GetFormReportUseCase)
    private readonly getReport: GetFormReportUseCase,
    @Inject(ListFormResponsesUseCase)
    private readonly listResponses: ListFormResponsesUseCase,
  ) {}

  // Relatório consolidado (contagens, médias e respostas de texto).
  @Get(':id/report')
  async report(@Param('id') id: string): Promise<FormReport> {
    return unwrap(await this.getReport.execute(parseId(id)));
  }

  // Uma linha por resposta digital (exportação); anônimo sem identificação.
  @Get(':id/responses')
  async responses(@Param('id') id: string): Promise<FormResponses> {
    return unwrap(await this.listResponses.execute(parseId(id)));
  }

  // Cópia não publicada (duplicar ou usar como modelo); o título ganha o prefixo "Cópia de ".
  @Post(':id/duplicates')
  async duplicate(@Param('id') id: string): Promise<FormView> {
    return unwrap(await this.duplicateForm.execute(parseId(id), 'Cópia de '));
  }

  @Get(':id')
  async get(@Param('id') id: string): Promise<FormView> {
    return unwrap(await this.getForm.execute(parseId(id)));
  }

  // Edição completa (conteúdo e status) com controle otimista: `version` deve ser a versão lida.
  @Patch(':id')
  async update(@Param('id') id: string, @Body() body: unknown): Promise<FormView> {
    const formId = parseId(id);

    const input = parseOrThrow(updateFormSchema, body, throwInvalidFields);

    return unwrap(await this.updateForm.execute({ id: formId, ...input }));
  }

  // Somente o status (publicar, despublicar, concluir, cancelar).
  @Put(':id/status')
  async status(@Param('id') id: string, @Body() body: unknown): Promise<FormView> {
    const formId = parseId(id);

    const input = parseOrThrow(changeStatusSchema, body, throwInvalidFields);

    return unwrap(await this.changeStatus.execute({ id: formId, ...input }));
  }

  // Somente não publicado, finalizado ou cancelado.
  @Delete(':id')
  @HttpCode(204)
  async delete(@Param('id') id: string): Promise<void> {
    unwrap(await this.deleteForm.execute(parseId(id)));
  }

  // URL para o navegador enviar a imagem direto ao bucket; depois, PUT :id/header-image confirma.
  @Post(':id/header-image/uploads')
  async headerImageUpload(
    @Param('id') id: string,
    @Body() body: unknown,
  ): Promise<HeaderImageUploadTicket> {
    const formId = parseId(id);

    const { contentType } = parseOrThrow(requestHeaderImageUploadSchema, body, throwInvalidFields);

    return unwrap(await this.requestUpload.execute(formId, contentType));
  }

  @Put(':id/header-image')
  async headerImage(@Param('id') id: string, @Body() body: unknown): Promise<FormView> {
    const formId = parseId(id);

    const { uploadId } = parseOrThrow(completeHeaderImageUploadSchema, body, throwInvalidFields);

    return unwrap(await this.completeUpload.execute(formId, uploadId));
  }

  @Delete(':id/header-image')
  @HttpCode(200)
  async deleteHeaderImage(@Param('id') id: string): Promise<FormView> {
    return unwrap(await this.removeImage.execute(parseId(id)));
  }
}
