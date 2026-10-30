import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Inject,
  NotFoundException,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import { CoreApiForwarder } from '../../core-api/presentation/core-api-forwarder.service.js';
import { pickQuery, resourcePath } from '../../core-api/presentation/forwarding.js';
import type { FastifyReply, FastifyRequest } from 'fastify';

const FORM_QUERY_KEYS = ['status', 'cursor', 'limit'] as const;

// O departamento compõe o caminho na Core API (que confere o catálogo): só códigos simples.
const departmentPath = (department: string, ...rest: string[]): string => {
  if (!/^[a-z][a-z-]{0,39}$/u.test(department)) {
    throw new NotFoundException('Departamento não encontrado.');
  }

  return ['departments', department, 'forms', ...rest].join('/');
};

// Formulários dos departamentos (ADR 0013), encaminhados à Core API.
@Controller('api/v1/departments/:department/forms')
export class DepartmentFormsController {
  constructor(@Inject(CoreApiForwarder) private readonly forwarder: CoreApiForwarder) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  list(
    @Param('department') department: string,
    @Query() query: unknown,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    return this.forwarder.forward(request, reply, {
      write: false,
      method: 'GET',
      path: departmentPath(department),
      query: pickQuery(query, FORM_QUERY_KEYS),
    });
  }

  @Get('summary')
  @Header('Cache-Control', 'no-store')
  summary(
    @Param('department') department: string,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    return this.forwarder.forward(request, reply, {
      write: false,
      method: 'GET',
      path: departmentPath(department, 'summary'),
    });
  }

  @Post()
  @Header('Cache-Control', 'no-store')
  create(
    @Param('department') department: string,
    @Body() body: unknown,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    return this.forwarder.forward(request, reply, {
      write: true,
      method: 'POST',
      path: departmentPath(department),
      body: body ?? {},
    });
  }
}

// A imagem do cabeçalho não passa por aqui: o navegador envia direto ao bucket de mídia pela URL
// devolvida em /header-image/uploads e depois confirma o envio.
@Controller('api/v1/forms')
export class FormsController {
  constructor(@Inject(CoreApiForwarder) private readonly forwarder: CoreApiForwarder) {}

  @Get(':id')
  @Header('Cache-Control', 'no-store')
  get(
    @Param('id') id: string,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    return this.forwarder.forward(request, reply, {
      write: false,
      method: 'GET',
      path: resourcePath('forms', id),
    });
  }

  @Patch(':id')
  @Header('Cache-Control', 'no-store')
  update(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    return this.forwarder.forward(request, reply, {
      write: true,
      method: 'PATCH',
      path: resourcePath('forms', id),
      body: body ?? {},
    });
  }

  @Delete(':id')
  @Header('Cache-Control', 'no-store')
  delete(
    @Param('id') id: string,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    return this.forwarder.forward(request, reply, {
      write: true,
      method: 'DELETE',
      path: resourcePath('forms', id),
    });
  }

  // Cópia não publicada (duplicar ou usar como modelo).
  @Post(':id/duplicates')
  @Header('Cache-Control', 'no-store')
  duplicate(
    @Param('id') id: string,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    return this.forwarder.forward(request, reply, {
      write: true,
      method: 'POST',
      path: resourcePath('forms', id, 'duplicates'),
    });
  }

  // Apaga o conteúdo das respostas (LGPD); só com o formulário finalizado ou cancelado.
  @Delete(':id/answers')
  @Header('Cache-Control', 'no-store')
  purgeAnswers(
    @Param('id') id: string,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    return this.forwarder.forward(request, reply, {
      write: true,
      method: 'DELETE',
      path: resourcePath('forms', id, 'answers'),
    });
  }

  @Put(':id/status')
  @Header('Cache-Control', 'no-store')
  status(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    return this.forwarder.forward(request, reply, {
      write: true,
      method: 'PUT',
      path: resourcePath('forms', id, 'status'),
      body: body ?? {},
    });
  }

  @Post(':id/header-image/uploads')
  @Header('Cache-Control', 'no-store')
  headerImageUpload(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    return this.forwarder.forward(request, reply, {
      write: true,
      method: 'POST',
      path: resourcePath('forms', id, 'header-image', 'uploads'),
      body: body ?? {},
    });
  }

  @Put(':id/header-image')
  @Header('Cache-Control', 'no-store')
  headerImage(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    return this.forwarder.forward(request, reply, {
      write: true,
      method: 'PUT',
      path: resourcePath('forms', id, 'header-image'),
      body: body ?? {},
    });
  }

  @Delete(':id/header-image')
  @Header('Cache-Control', 'no-store')
  deleteHeaderImage(
    @Param('id') id: string,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    return this.forwarder.forward(request, reply, {
      write: true,
      method: 'DELETE',
      path: resourcePath('forms', id, 'header-image'),
    });
  }
}
