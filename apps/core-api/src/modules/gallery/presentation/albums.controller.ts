import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Param,
  Patch,
  Post,
  Put,
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
import {
  ChangeAlbumStatusUseCase,
  PublishAlbumPhotosUseCase,
  SetAlbumCoverUseCase,
  type AlbumStatusAction,
  type PublishBatchResult,
} from '../application/publication.use-cases.js';
import { parseId, throwInvalidFields, unwrap } from './gallery-problem.js';
import {
  createAlbumSchema,
  listAlbumsSchema,
  listPhotosSchema,
  requestUploadsSchema,
  setCoverSchema,
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
    @Inject(PublishAlbumPhotosUseCase)
    private readonly publishAlbumPhotos: PublishAlbumPhotosUseCase,
    @Inject(SetAlbumCoverUseCase)
    private readonly setAlbumCover: SetAlbumCoverUseCase,
    @Inject(ChangeAlbumStatusUseCase)
    private readonly changeAlbumStatus: ChangeAlbumStatusUseCase,
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

  // Publica um lote das fotos prontas ainda não publicadas; repetir enquanto `remaining` > 0.
  @Post(':id/photos/publish')
  @HttpCode(200)
  async publishPhotos(@Param('id') id: string): Promise<PublishBatchResult> {
    return unwrap(await this.publishAlbumPhotos.execute(parseId(id)));
  }

  // A capa precisa ser uma foto publicada do próprio álbum.
  @Put(':id/cover')
  async setCover(@Param('id') id: string, @Body() body: unknown): Promise<AlbumView> {
    const { photoId } = parseOrThrow(setCoverSchema, body, throwInvalidFields);

    return unwrap(await this.setAlbumCover.execute(parseId(id), photoId));
  }

  // DRAFT → PUBLISHED: exige ao menos uma foto publicada.
  @Post(':id/publish')
  @HttpCode(200)
  publish(@Param('id') id: string): Promise<AlbumView> {
    return this.change(id, 'publish');
  }

  // PUBLISHED → DRAFT: sai do site; as fotos continuam publicadas.
  @Post(':id/unpublish')
  @HttpCode(200)
  unpublish(@Param('id') id: string): Promise<AlbumView> {
    return this.change(id, 'unpublish');
  }

  // DRAFT → ARCHIVED (somente leitura).
  @Post(':id/archive')
  @HttpCode(200)
  archive(@Param('id') id: string): Promise<AlbumView> {
    return this.change(id, 'archive');
  }

  // ARCHIVED → DRAFT.
  @Post(':id/restore')
  @HttpCode(200)
  restore(@Param('id') id: string): Promise<AlbumView> {
    return this.change(id, 'restore');
  }

  private async change(id: string, action: AlbumStatusAction): Promise<AlbumView> {
    return unwrap(await this.changeAlbumStatus.execute(parseId(id), action));
  }
}
