import { Controller, Delete, HttpCode, Inject, Param, Post, UseGuards } from '@nestjs/common';
import { ServiceTokenGuard } from '../../../shared/presentation/service-token.guard.js';
import {
  CompleteUploadUseCase,
  DeletePhotoUseCase,
  type PhotoView,
} from '../application/photo.use-cases.js';
import { parseId, unwrap } from './gallery-problem.js';

// Fotos são listadas e enviadas a partir do álbum (/gallery/albums/:id); aqui ficam as operações
// sobre uma foto já criada.
@Controller('gallery/photos')
@UseGuards(ServiceTokenGuard)
export class PhotosController {
  constructor(
    @Inject(CompleteUploadUseCase)
    private readonly completeUpload: CompleteUploadUseCase,
    @Inject(DeletePhotoUseCase)
    private readonly deletePhoto: DeletePhotoUseCase,
  ) {}

  // O PUT direto ao bucket terminou: a foto entra na fila de processamento (202, assíncrono).
  @Post(':id/complete')
  @HttpCode(202)
  async complete(@Param('id') id: string): Promise<PhotoView> {
    return unwrap(await this.completeUpload.execute(parseId(id)));
  }

  // Exclusão definitiva: objetos privados e metadados.
  @Delete(':id')
  @HttpCode(204)
  async delete(@Param('id') id: string): Promise<void> {
    unwrap(await this.deletePhoto.execute(parseId(id)));
  }
}
