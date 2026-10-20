import { Logger } from '@nestjs/common';
import { PhotoProcessingQueue } from '../application/ports.js';

type PhotoHandler = (photoId: string) => Promise<void>;

// Fila em memória, uma foto por vez (ADR 0010). O banco é a fonte da verdade: fotos PROCESSING que
// se perderem com a parada da instância são retomadas ao iniciar (ResumeProcessingUseCase).
export class InProcessPhotoQueue extends PhotoProcessingQueue {
  private readonly logger = new Logger(InProcessPhotoQueue.name);

  private readonly pending: string[] = [];

  private handler: PhotoHandler | null = null;

  private draining: Promise<void> | null = null;

  start(handler: PhotoHandler): void {
    this.handler = handler;

    this.drain();
  }

  enqueue(photoId: string): void {
    if (!this.pending.includes(photoId)) {
      this.pending.push(photoId);
    }

    this.drain();
  }

  // Resolve quando a fila esvazia (usado nos testes e no encerramento).
  async idle(): Promise<void> {
    while (this.draining) {
      // oxlint-disable-next-line no-await-in-loop -- aguarda rodadas sucessivas da fila
      await this.draining;
    }
  }

  private drain(): void {
    if (this.draining || !this.handler) {
      return;
    }

    const handler = this.handler;

    this.draining = (async () => {
      for (let photoId = this.pending.shift(); photoId; photoId = this.pending.shift()) {
        try {
          // oxlint-disable-next-line no-await-in-loop -- processamento sequencial intencional
          await handler(photoId);
        } catch {
          this.logger.error('Falha inesperada ao processar uma foto da galeria.');
        }
      }
    })().finally(() => {
      this.draining = null;
    });
  }
}
