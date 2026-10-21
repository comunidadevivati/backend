import { Module } from '@nestjs/common';
import { CoreApiModule } from '../core-api/core-api.module.js';
import {
  GalleryAlbumsController,
  GalleryPhotosController,
} from './presentation/gallery.controllers.js';
import { PublicGalleryController } from './presentation/public-gallery.controller.js';

// Rotas web da galeria de fotos (ADR 0010), encaminhadas à Core API: administração (com sessão)
// e leitura do site público (sem sessão).
@Module({
  imports: [CoreApiModule],
  controllers: [GalleryAlbumsController, GalleryPhotosController, PublicGalleryController],
})
export class GalleryModule {}
