import { err, ok, type Result } from '../../../shared/domain/result.js';

export type PhotoStatus = 'PENDING_UPLOAD' | 'PROCESSING' | 'READY' | 'FAILED';

export type PhotoFailure = 'invalid_image' | 'processing_error';

// Formatos aceitos no envio. HEIC fica de fora no MVP (ADR 0010).
const ACCEPTED_PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;

export type AcceptedPhotoType = (typeof ACCEPTED_PHOTO_TYPES)[number];

export const MAX_PHOTO_BYTES = 25 * 1024 * 1024;

export const MAX_PHOTOS_PER_ALBUM = 500;

// Larguras das variantes (srcset). Cada foto recebe somente as que não ultrapassam a sua largura.
const PHOTO_WIDTHS = [320, 640, 1024, 1600, 2048] as const;

export const variantWidthsFor = (width: number): number[] => {
  const widths = PHOTO_WIDTHS.filter((candidate) => candidate <= width);

  return widths.length > 0 ? widths : [width];
};

export const isAcceptedPhotoType = (value: string): value is AcceptedPhotoType =>
  (ACCEPTED_PHOTO_TYPES as readonly string[]).includes(value);

export interface ProcessedPhoto {
  width: number;
  height: number;
  // Imagem minúscula em data URI, exibida borrada enquanto a variante carrega.
  placeholder: string;
  variantWidths: number[];
}

export interface PhotoSnapshot {
  id: string;
  albumId: string;
  status: PhotoStatus;
  // Tipo e tamanho declarados no pedido de envio.
  contentType: AcceptedPhotoType;
  byteSize: number;
  width: number | null;
  height: number | null;
  placeholder: string | null;
  variantWidths: number[];
  failure: PhotoFailure | null;
  // Chave da publicação atual (pasta das variantes na área pública); null quando não publicada.
  publicationKey: string | null;
  publishedAt: string | null;
  version: number;
}

// Fotografia de um álbum: PENDING_UPLOAD → PROCESSING → READY | FAILED. Uma foto READY pode ser
// publicada (variantes copiadas para a área pública do bucket, ADR 0010) e despublicada.
export class Photo {
  private constructor(private state: PhotoSnapshot) {}

  static request(
    id: string,
    albumId: string,
    contentType: AcceptedPhotoType,
    byteSize: number,
  ): Photo {
    return new Photo({
      id,
      albumId,
      status: 'PENDING_UPLOAD',
      contentType,
      byteSize,
      width: null,
      height: null,
      placeholder: null,
      variantWidths: [],
      failure: null,
      publicationKey: null,
      publishedAt: null,
      version: 1,
    });
  }

  // Reconstitui um estado já validado e persistido.
  static restore(snapshot: PhotoSnapshot): Photo {
    return new Photo({ ...snapshot, variantWidths: [...snapshot.variantWidths] });
  }

  get id(): string {
    return this.state.id;
  }

  get albumId(): string {
    return this.state.albumId;
  }

  get status(): PhotoStatus {
    return this.state.status;
  }

  get version(): number {
    return this.state.version;
  }

  get variantWidths(): readonly number[] {
    return this.state.variantWidths;
  }

  get publicationKey(): string | null {
    return this.state.publicationKey;
  }

  // As variantes já foram copiadas para a área pública sob esta chave.
  publish(publicationKey: string, publishedAt: string): Result<void, 'invalid_photo_status'> {
    if (this.state.status !== 'READY' || this.state.publicationKey !== null) {
      return err('invalid_photo_status');
    }

    this.state = { ...this.state, publicationKey, publishedAt };

    return ok();
  }

  // Devolve a chave da publicação encerrada, para apagar as variantes públicas.
  unpublish(): Result<string, 'invalid_photo_status'> {
    const { publicationKey } = this.state;

    if (publicationKey === null) {
      return err('invalid_photo_status');
    }

    this.state = { ...this.state, publicationKey: null, publishedAt: null };

    return ok(publicationKey);
  }

  // O envio terminou (o objeto existe no bucket): segue para o processamento.
  markUploaded(byteSize: number): Result<void, 'invalid_photo_status'> {
    if (this.state.status !== 'PENDING_UPLOAD') {
      return err('invalid_photo_status');
    }

    this.state = { ...this.state, status: 'PROCESSING', byteSize };

    return ok();
  }

  markReady({ height, placeholder, variantWidths, width }: ProcessedPhoto): void {
    this.state = {
      ...this.state,
      status: 'READY',
      width,
      height,
      placeholder,
      variantWidths: [...variantWidths],
      failure: null,
    };
  }

  markFailed(failure: PhotoFailure): void {
    this.state = { ...this.state, status: 'FAILED', failure };
  }

  toSnapshot(): PhotoSnapshot {
    return { ...this.state, variantWidths: [...this.state.variantWidths] };
  }
}
