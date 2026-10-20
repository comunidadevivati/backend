import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { ProcessPhotoUseCase, ResumeProcessingUseCase } from '../application/photo.use-cases.js';
import { InProcessPhotoQueue } from './in-process-photo.queue.js';

// Liga a fila ao processamento depois que as migrations rodaram e retoma as fotos pendentes.
@Injectable()
export class PhotoProcessingBootstrap implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(PhotoProcessingBootstrap.name);

  constructor(
    @Inject(InProcessPhotoQueue) private readonly queue: InProcessPhotoQueue,
    @Inject(ProcessPhotoUseCase) private readonly processPhoto: ProcessPhotoUseCase,
    @Inject(ResumeProcessingUseCase) private readonly resume: ResumeProcessingUseCase,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    this.queue.start((photoId) => this.processPhoto.execute(photoId));

    const resumed = await this.resume.execute();

    if (resumed > 0) {
      this.logger.log(`${resumed} foto(s) da galeria retomada(s) para processamento.`);
    }
  }

  // Espera a foto em andamento para não deixar objetos pela metade.
  onApplicationShutdown(): Promise<void> {
    return this.queue.idle();
  }
}
