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

// Cards do backlog (ADR 0014), encaminhados à Core API.
@Controller('api/v1/backlog-cards')
export class BacklogCardsController {
  constructor(@Inject(CoreApiForwarder) private readonly forwarder: CoreApiForwarder) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  list(@Req() request: FastifyRequest, @Res({ passthrough: true }) reply: FastifyReply) {
    return this.forwarder.forward(request, reply, {
      write: false,
      method: 'GET',
      path: 'backlog-cards',
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
      path: 'backlog-cards',
      body: body ?? {},
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
      path: resourcePath('backlog-cards', id),
      body: body ?? {},
    });
  }

  @Put(':id/status')
  @Header('Cache-Control', 'no-store')
  move(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    return this.forwarder.forward(request, reply, {
      write: true,
      method: 'PUT',
      path: `${resourcePath('backlog-cards', id)}/status`,
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
      path: resourcePath('backlog-cards', id),
    });
  }
}
