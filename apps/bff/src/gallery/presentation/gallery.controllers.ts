import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Inject,
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

const ALBUM_QUERY_KEYS = ['status', 'cursor', 'limit'] as const;

const PHOTO_QUERY_KEYS = ['cursor', 'limit'] as const;

type AlbumAction = 'publish' | 'unpublish' | 'archive' | 'restore';

// Administração da galeria (ADR 0010), encaminhada à Core API. As fotos não passam por aqui: o
// navegador envia direto ao bucket de mídia pela URL devolvida em /uploads.
@Controller('api/v1/gallery/albums')
export class GalleryAlbumsController {
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
      path: 'gallery/albums',
      query: pickQuery(query, ALBUM_QUERY_KEYS),
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
      path: 'gallery/albums',
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
      path: resourcePath('gallery/albums', id),
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
      path: resourcePath('gallery/albums', id),
      body: body ?? {},
    });
  }

  @Get(':id/photos')
  @Header('Cache-Control', 'no-store')
  photos(
    @Param('id') id: string,
    @Query() query: unknown,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    return this.forwarder.forward(request, reply, {
      write: false,
      method: 'GET',
      path: resourcePath('gallery/albums', id, 'photos'),
      query: pickQuery(query, PHOTO_QUERY_KEYS),
    });
  }

  @Post(':id/uploads')
  @Header('Cache-Control', 'no-store')
  uploads(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    return this.forwarder.forward(request, reply, {
      write: true,
      method: 'POST',
      path: resourcePath('gallery/albums', id, 'uploads'),
      body: body ?? {},
    });
  }

  // Publica um lote das fotos prontas; o painel repete enquanto `remaining` > 0.
  @Post(':id/photos/publish')
  @Header('Cache-Control', 'no-store')
  publishPhotos(
    @Param('id') id: string,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    return this.forwarder.forward(request, reply, {
      write: true,
      method: 'POST',
      path: resourcePath('gallery/albums', id, 'photos', 'publish'),
    });
  }

  @Put(':id/cover')
  @Header('Cache-Control', 'no-store')
  setCover(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    return this.forwarder.forward(request, reply, {
      write: true,
      method: 'PUT',
      path: resourcePath('gallery/albums', id, 'cover'),
      body: body ?? {},
    });
  }

  @Post(':id/publish')
  @Header('Cache-Control', 'no-store')
  publish(
    @Param('id') id: string,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    return this.change(id, 'publish', request, reply);
  }

  @Post(':id/unpublish')
  @Header('Cache-Control', 'no-store')
  unpublish(
    @Param('id') id: string,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    return this.change(id, 'unpublish', request, reply);
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

  private change(id: string, action: AlbumAction, request: FastifyRequest, reply: FastifyReply) {
    return this.forwarder.forward(request, reply, {
      write: true,
      method: 'POST',
      path: resourcePath('gallery/albums', id, action),
    });
  }
}

@Controller('api/v1/gallery/photos')
export class GalleryPhotosController {
  constructor(@Inject(CoreApiForwarder) private readonly forwarder: CoreApiForwarder) {}

  // O PUT direto ao bucket terminou: a Core API confere o arquivo e agenda o processamento.
  @Post(':id/complete')
  @Header('Cache-Control', 'no-store')
  complete(
    @Param('id') id: string,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    return this.forwarder.forward(request, reply, {
      write: true,
      method: 'POST',
      path: resourcePath('gallery/photos', id, 'complete'),
    });
  }

  @Post(':id/publish')
  @Header('Cache-Control', 'no-store')
  publish(
    @Param('id') id: string,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    return this.forwarder.forward(request, reply, {
      write: true,
      method: 'POST',
      path: resourcePath('gallery/photos', id, 'publish'),
    });
  }

  @Post(':id/unpublish')
  @Header('Cache-Control', 'no-store')
  unpublish(
    @Param('id') id: string,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    return this.forwarder.forward(request, reply, {
      write: true,
      method: 'POST',
      path: resourcePath('gallery/photos', id, 'unpublish'),
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
      path: resourcePath('gallery/photos', id),
    });
  }
}
