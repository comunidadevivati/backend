import { err, ok, type Result } from '../../../shared/domain/result.js';
import type {
  AlbumDescription,
  AlbumTitle,
  OccurrenceDate,
} from './value-objects/album-details.js';

export type AlbumStatus = 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';

export interface AlbumDetails {
  title: AlbumTitle;
  description: AlbumDescription | null;
  occurredOn: OccurrenceDate;
}

export interface AlbumSnapshot {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  occurredOn: string;
  coverPhotoId: string | null;
  status: AlbumStatus;
  publishedAt: string | null;
  version: number;
}

const detailsToState = ({ description, occurredOn, title }: AlbumDetails) => ({
  title: title.value,
  description: description?.value ?? null,
  occurredOn: occurredOn.value,
});

// Álbum de fotos de um culto ou evento. Nasce DRAFT (fora do site público); a publicação e o
// arquivamento vêm na etapa de publicação (ADR 0010). Arquivado é somente leitura.
export class Album {
  private constructor(private state: AlbumSnapshot) {}

  static create(id: string, slug: string, details: AlbumDetails): Album {
    return new Album({
      id,
      slug,
      ...detailsToState(details),
      coverPhotoId: null,
      status: 'DRAFT',
      publishedAt: null,
      version: 1,
    });
  }

  // Reconstitui um estado já validado e persistido.
  static restore(snapshot: AlbumSnapshot): Album {
    return new Album({ ...snapshot });
  }

  get id(): string {
    return this.state.id;
  }

  get version(): number {
    return this.state.version;
  }

  get acceptsPhotos(): boolean {
    return this.state.status !== 'ARCHIVED';
  }

  // O slug não muda com o título: a URL pública do álbum é estável.
  updateDetails(details: AlbumDetails): Result<void, 'album_archived'> {
    if (this.state.status === 'ARCHIVED') {
      return err('album_archived');
    }

    this.state = { ...this.state, ...detailsToState(details) };

    return ok();
  }

  toSnapshot(): AlbumSnapshot {
    return { ...this.state };
  }
}
