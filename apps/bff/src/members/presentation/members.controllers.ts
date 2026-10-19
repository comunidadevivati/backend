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

const LIST_QUERY_KEYS = ['status', 'congregationId', 'search', 'cursor', 'limit'] as const;

type MemberAction = 'activate' | 'deactivate' | 'archive' | 'restore';

type MembershipAction = 'activate' | 'deactivate';

@Controller('api/v1/members')
export class MembersController {
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
      path: 'members',
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
      path: resourcePath('members', id),
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
      path: 'members',
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
      path: resourcePath('members', id),
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
    return this.change(id, 'activate', request, reply);
  }

  @Post(':id/deactivate')
  @Header('Cache-Control', 'no-store')
  deactivate(
    @Param('id') id: string,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    return this.change(id, 'deactivate', request, reply);
  }

  @Post(':id/archive')
  @Header('Cache-Control', 'no-store')
  archive(
    @Param('id') id: string,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    return this.change(id, 'archive', request, reply);
  }

  @Post(':id/restore')
  @Header('Cache-Control', 'no-store')
  restore(
    @Param('id') id: string,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    return this.change(id, 'restore', request, reply);
  }

  @Get(':id/memberships')
  @Header('Cache-Control', 'no-store')
  memberships(
    @Param('id') id: string,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    return this.forwarder.forward(request, reply, {
      write: false,
      method: 'GET',
      path: resourcePath('members', id, 'memberships'),
    });
  }

  @Post(':id/memberships')
  @Header('Cache-Control', 'no-store')
  addMembership(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    return this.forwarder.forward(request, reply, {
      write: true,
      method: 'POST',
      path: resourcePath('members', id, 'memberships'),
      body: body ?? {},
    });
  }

  private change(id: string, action: MemberAction, request: FastifyRequest, reply: FastifyReply) {
    return this.forwarder.forward(request, reply, {
      write: true,
      method: 'POST',
      path: resourcePath('members', id, action),
    });
  }
}

@Controller('api/v1/memberships')
export class MembershipsController {
  constructor(@Inject(CoreApiForwarder) private readonly forwarder: CoreApiForwarder) {}

  @Post(':id/activate')
  @Header('Cache-Control', 'no-store')
  activate(
    @Param('id') id: string,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    return this.change(id, 'activate', request, reply);
  }

  @Post(':id/deactivate')
  @Header('Cache-Control', 'no-store')
  deactivate(
    @Param('id') id: string,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    return this.change(id, 'deactivate', request, reply);
  }

  private change(
    id: string,
    action: MembershipAction,
    request: FastifyRequest,
    reply: FastifyReply,
  ) {
    return this.forwarder.forward(request, reply, {
      write: true,
      method: 'POST',
      path: resourcePath('memberships', id, action),
    });
  }
}
