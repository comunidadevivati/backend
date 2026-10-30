import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Inject,
  Param,
  Post,
  Put,
  Req,
  Res,
} from '@nestjs/common';
import { CoreApiForwarder } from '../../core-api/presentation/core-api-forwarder.service.js';
import { resourcePath } from '../../core-api/presentation/forwarding.js';
import type { FastifyReply, FastifyRequest } from 'fastify';

// Grupos de e-mails (ADR 0013), encaminhados à Core API. As contas que podem entrar nos grupos vêm
// de /api/v1/email-recipients (contas do BFF).
@Controller('api/v1/email-groups')
export class EmailGroupsController {
  constructor(@Inject(CoreApiForwarder) private readonly forwarder: CoreApiForwarder) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  list(@Req() request: FastifyRequest, @Res({ passthrough: true }) reply: FastifyReply) {
    return this.forwarder.forward(request, reply, {
      write: false,
      method: 'GET',
      path: 'email-groups',
    });
  }

  @Post()
  @Header('Cache-Control', 'no-store')
  create(
    @Body() body: unknown,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    return this.forwarder.forward(request, reply, {
      write: true,
      method: 'POST',
      path: 'email-groups',
      body: body ?? {},
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
      path: resourcePath('email-groups', id),
    });
  }

  @Put(':id')
  @Header('Cache-Control', 'no-store')
  update(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    return this.forwarder.forward(request, reply, {
      write: true,
      method: 'PUT',
      path: resourcePath('email-groups', id),
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
      path: resourcePath('email-groups', id),
    });
  }
}
