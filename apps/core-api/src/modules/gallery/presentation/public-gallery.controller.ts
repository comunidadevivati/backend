import { Controller, Get, Inject, Param, Query, UseGuards } from '@nestjs/common';
import { ProblemException } from '../../../shared/presentation/problem-details.js';
import { parseOrThrow } from '../../../shared/presentation/request-parsing.js';
import { ServiceTokenGuard } from '../../../shared/presentation/service-token.guard.js';
import {
  GetPublicAlbumUseCase,
  ListPublicAlbumsUseCase,
  ListPublicPhotosUseCase,
  type PublicAlbumView,
  type PublicPage,
  type PublicPhotoView,
} from '../application/public-gallery.use-cases.js';
import { throwInvalidFields, unwrap } from './gallery-problem.js';
import {
  listPublicAlbumsSchema,
  listPublicPhotosSchema,
  slugSchema,
} from './gallery-request.schemas.js';

// Um slug fora do formato não pode existir: responde como inexistente.
const parseSlug = (slug: string): string => {
  if (!slugSchema.safeParse(slug).success) {
    throw new ProblemException(404, 'Registro não encontrado.');
  }

  return slug;
};

// Leitura do site público (ADR 0010): somente álbuns publicados e fotos publicadas. Chamado pelo
// BFF com a credencial de serviço, em nome de visitantes anônimos.
@Controller('gallery/public/albums')
@UseGuards(ServiceTokenGuard)
export class PublicGalleryController {
  constructor(
    @Inject(ListPublicAlbumsUseCase)
    private readonly listAlbums: ListPublicAlbumsUseCase,
    @Inject(GetPublicAlbumUseCase)
    private readonly getAlbum: GetPublicAlbumUseCase,
    @Inject(ListPublicPhotosUseCase)
    private readonly listPhotos: ListPublicPhotosUseCase,
  ) {}

  @Get()
  async list(@Query() query: unknown): Promise<PublicPage<PublicAlbumView>> {
    return this.listAlbums.execute(parseOrThrow(listPublicAlbumsSchema, query, throwInvalidFields));
  }

  @Get(':slug')
  async get(@Param('slug') slug: string): Promise<PublicAlbumView> {
    return unwrap(await this.getAlbum.execute(parseSlug(slug)));
  }

  @Get(':slug/photos')
  async photos(
    @Param('slug') slug: string,
    @Query() query: unknown,
  ): Promise<PublicPage<PublicPhotoView>> {
    const page = parseOrThrow(listPublicPhotosSchema, query, throwInvalidFields);

    return unwrap(await this.listPhotos.execute(parseSlug(slug), page));
  }
}
