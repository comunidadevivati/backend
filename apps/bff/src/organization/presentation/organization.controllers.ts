import {
  Body,
  Controller,
  Get,
  Header,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import { CoreApiForwarder } from '../../core-api/presentation/core-api-forwarder.service.js';
import { pickQuery, resourcePath } from '../../core-api/presentation/forwarding.js';
import type { FastifyReply, FastifyRequest } from 'fastify';

const LIST_QUERY_KEYS = ['status', 'cursor', 'limit'] as const;

const congregationPath = (id: string, action?: 'activate' | 'deactivate'): string =>
  action ? resourcePath('congregations', id, action) : resourcePath('congregations', id);

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
      query: pickQuery(query, LIST_QUERY_KEYS),
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
