import {
  Body,
  Controller,
  Get,
  Header,
  Inject,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import { z } from 'zod';
import { CoreApiForwarder } from './core-api-forwarder.service.js';
import type { FastifyReply, FastifyRequest } from 'fastify';

// Somente os filtros conhecidos seguem para a Core API.
const LIST_QUERY_KEYS = ['status', 'cursor', 'limit'] as const;

const pickListQuery = (query: unknown): Record<string, string> =>
  Object.fromEntries(
    LIST_QUERY_KEYS.flatMap((key) => {
      const value = (query as Record<string, unknown> | undefined)?.[key];

      return typeof value === 'string' ? [[key, value]] : [];
    }),
  );

// O ID compõe o caminho na Core API: só UUIDs são aceitos, sem risco de path traversal.
const congregationPath = (id: string, action?: 'activate' | 'deactivate'): string => {
  if (!z.uuid().safeParse(id).success) {
    throw new NotFoundException('Registro não encontrado.');
  }

  return action ? `congregations/${id}/${action}` : `congregations/${id}`;
};

@Controller('api/v1/organization')
export class OrganizationController {
  constructor(@Inject(CoreApiForwarder) private readonly forwarder: CoreApiForwarder) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  get(@Req() request: FastifyRequest, @Res({ passthrough: true }) reply: FastifyReply) {
    return this.forwarder.forward(request, reply, {
      write: false,
      method: 'GET',
      path: 'organization',
    });
  }

  @Patch()
  @Header('Cache-Control', 'no-store')
  update(
    @Body() body: unknown,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    return this.forwarder.forward(request, reply, {
      write: true,
      method: 'PATCH',
      path: 'organization',
      body: body ?? {},
    });
  }

  @Post('activate')
  @Header('Cache-Control', 'no-store')
  activate(@Req() request: FastifyRequest, @Res({ passthrough: true }) reply: FastifyReply) {
    return this.forwarder.forward(request, reply, {
      write: true,
      method: 'POST',
      path: 'organization/activate',
    });
  }

  @Post('deactivate')
  @Header('Cache-Control', 'no-store')
  deactivate(@Req() request: FastifyRequest, @Res({ passthrough: true }) reply: FastifyReply) {
    return this.forwarder.forward(request, reply, {
      write: true,
      method: 'POST',
      path: 'organization/deactivate',
    });
  }
}

@Controller('api/v1/congregations')
export class CongregationsController {
  constructor(@Inject(CoreApiForwarder) private readonly forwarder: CoreApiForwarder) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  list(
    @Query() query: unknown,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    return this.forwarder.forward(request, reply, {
      write: false,
      method: 'GET',
      path: 'congregations',
      query: pickListQuery(query),
    });
  }

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
      path: congregationPath(id),
    });
  }

  @Post()
  @Header('Cache-Control', 'no-store')
  register(
    @Body() body: unknown,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    return this.forwarder.forward(request, reply, {
      write: true,
      method: 'POST',
      path: 'congregations',
      body: body ?? {},
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
      path: congregationPath(id),
      body: body ?? {},
    });
  }

  @Post(':id/activate')
  @Header('Cache-Control', 'no-store')
  activate(
    @Param('id') id: string,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    return this.forwarder.forward(request, reply, {
      write: true,
      method: 'POST',
      path: congregationPath(id, 'activate'),
    });
  }

  @Post(':id/deactivate')
  @Header('Cache-Control', 'no-store')
  deactivate(
    @Param('id') id: string,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    return this.forwarder.forward(request, reply, {
      write: true,
      method: 'POST',
      path: congregationPath(id, 'deactivate'),
    });
  }
}
