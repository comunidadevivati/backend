import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { parseOrThrow } from '../../../shared/presentation/request-parsing.js';
import { ServiceTokenGuard } from '../../../shared/presentation/service-token.guard.js';
import {
  CreateAlbumUseCase,
  GetAlbumUseCase,
  ListAlbumsUseCase,
  UpdateAlbumUseCase,
  type AlbumPage,
} from '../application/album.use-cases.js';
import {
  ListPhotosUseCase,
  RequestUploadsUseCase,
  type PhotoPage,
  type UploadTicket,
} from '../application/photo.use-cases.js';
import { parseId, throwInvalidFields, unwrap } from './gallery-problem.js';
import {
  createAlbumSchema,
  listAlbumsSchema,
  listPhotosSchema,
  requestUploadsSchema,
  updateAlbumSchema,
} from './gallery-request.schemas.js';
import type { AlbumView } from '../application/ports.js';

// Administração da galeria (ADR 0010), chamada somente pelo BFF com a credencial de serviço.
@Controller('gallery/albums')
@UseGuards(ServiceTokenGuard)
export class AlbumsController {
  constructor(
    @Inject(ListAlbumsUseCase)
    private readonly listAlbums: ListAlbumsUseCase,
    @Inject(GetAlbumUseCase)
    private readonly getAlbum: GetAlbumUseCase,
    @Inject(CreateAlbumUseCase)
    private readonly createAlbum: CreateAlbumUseCase,
    @Inject(UpdateAlbumUseCase)
    private readonly updateAlbum: UpdateAlbumUseCase,
    @Inject(ListPhotosUseCase)
    private readonly listPhotos: ListPhotosUseCase,
    @Inject(RequestUploadsUseCase)
    private readonly requestUploads: RequestUploadsUseCase,
  ) {}

  // Filtros: status, cursor (nextCursor da página anterior) e limit. Mais recentes primeiro.
  @Get()
  async list(@Query() query: unknown): Promise<AlbumPage> {
    return this.listAlbums.execute(parseOrThrow(listAlbumsSchema, query, throwInvalidFields));
  }

  // O álbum nasce DRAFT, com slug derivado da data e do título.
  @Post()
  async create(@Body() body: unknown): Promise<AlbumView> {
    return unwrap(
      await this.createAlbum.execute(parseOrThrow(createAlbumSchema, body, throwInvalidFields)),
    );
  }

  @Get(':id')
  async get(@Param('id') id: string): Promise<AlbumView> {
    return unwrap(await this.getAlbum.execute(parseId(id)));
  }

  // Alteração parcial com controle otimista: `version` deve ser a versão lida.
  @Patch(':id')
  async update(@Param('id') id: string, @Body() body: unknown): Promise<AlbumView> {
    const { version, ...details } = parseOrThrow(updateAlbumSchema, body, throwInvalidFields);

    return unwrap(
      await this.updateAlbum.execute({ id: parseId(id), expectedVersion: version, details }),
    );
  }

  // Fotos já enviadas, na ordem de envio, com miniatura de validade curta.
  @Get(':id/photos')
  async photos(@Param('id') id: string, @Query() query: unknown): Promise<PhotoPage> {
    const albumId = parseId(id);

    const { cursor, limit } = parseOrThrow(listPhotosSchema, query, throwInvalidFields);

    return unwrap(await this.listPhotos.execute({ albumId, cursor, limit }));
  }

  // Uma URL de envio direto ao bucket de mídia para cada arquivo, na ordem recebida.
  @Post(':id/uploads')
  async uploads(
    @Param('id') id: string,
    @Body() body: unknown,
  ): Promise<{ items: UploadTicket[] }> {
    const albumId = parseId(id);

    const { files } = parseOrThrow(requestUploadsSchema, body, throwInvalidFields);

    return { items: unwrap(await this.requestUploads.execute({ albumId, files })) };
  }
}
