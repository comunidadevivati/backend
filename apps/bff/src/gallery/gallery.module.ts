import { Module } from '@nestjs/common';
import { CoreApiModule } from '../core-api/core-api.module.js';
import {
  GalleryAlbumsController,
  GalleryPhotosController,
} from './presentation/gallery.controllers.js';

// Rotas web da galeria de fotos (ADR 0010), encaminhadas à Core API.
@Module({
  imports: [CoreApiModule],
  controllers: [GalleryAlbumsController, GalleryPhotosController],
})
export class GalleryModule {}
