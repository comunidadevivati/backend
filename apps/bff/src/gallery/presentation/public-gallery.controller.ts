import { Controller, Get, Header, Inject, Param, Query, Res } from '@nestjs/common';
import { CoreApiForwarder } from '../../core-api/presentation/core-api-forwarder.service.js';
import { pickQuery } from '../../core-api/presentation/forwarding.js';
import type { FastifyReply } from 'fastify';

const PAGE_QUERY_KEYS = ['cursor', 'limit'] as const;

// Cache curto: o painel publica e despublica a qualquer momento. As URLs das fotos que vêm na
// resposta podem ser assinadas, com validade de uma hora, enquanto o domínio público não existe.
const PUBLIC_CACHE_CONTROL = 'public, max-age=60';

// O slug compõe o caminho na Core API: só o formato gerado pela aplicação, sem path traversal.
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;

const albumPath = (slug: string, ...rest: string[]): string =>
  ['gallery/public/albums', SLUG_PATTERN.test(slug) ? slug : 'invalido', ...rest].join('/');

// Galeria do site público (ADR 0010): sem sessão, somente leitura de álbuns e fotos publicados.
@Controller('api/v1/public/gallery/albums')
export class PublicGalleryController {
  constructor(@Inject(CoreApiForwarder) private readonly forwarder: CoreApiForwarder) {}

  @Get()
  @Header('Cache-Control', PUBLIC_CACHE_CONTROL)
  list(@Query() query: unknown, @Res({ passthrough: true }) reply: FastifyReply) {
    return this.forwarder.forwardPublic(reply, {
      path: 'gallery/public/albums',
      query: pickQuery(query, PAGE_QUERY_KEYS),
    });
  }

  @Get(':slug')
  @Header('Cache-Control', PUBLIC_CACHE_CONTROL)
  get(@Param('slug') slug: string, @Res({ passthrough: true }) reply: FastifyReply) {
    return this.forwarder.forwardPublic(reply, { path: albumPath(slug) });
  }

  @Get(':slug/photos')
  @Header('Cache-Control', PUBLIC_CACHE_CONTROL)
  photos(
    @Param('slug') slug: string,
    @Query() query: unknown,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    return this.forwarder.forwardPublic(reply, {
      path: albumPath(slug, 'photos'),
      query: pickQuery(query, PAGE_QUERY_KEYS),
    });
  }
}
