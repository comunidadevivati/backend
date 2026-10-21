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

export type AlbumTransitionError = 'album_archived' | 'invalid_album_status';

// Álbum de fotos de um culto ou evento (ADR 0010): DRAFT (fora do site) ⇄ PUBLISHED, e DRAFT ⇄
// ARCHIVED. Arquivado é somente leitura; para arquivar um álbum publicado, despublique-o antes.
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

  get status(): AlbumStatus {
    return this.state.status;
  }

  get coverPhotoId(): string | null {
    return this.state.coverPhotoId;
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

  // A existência de foto publicada é conferida pela Application. Sem capa definida, assume a
  // primeira foto publicada.
  publish(publishedAt: string, firstPublishedPhotoId: string): Result<void, AlbumTransitionError> {
    if (this.state.status !== 'DRAFT') {
      return err(this.state.status === 'ARCHIVED' ? 'album_archived' : 'invalid_album_status');
    }

    this.state = {
      ...this.state,
      status: 'PUBLISHED',
      publishedAt,
      coverPhotoId: this.state.coverPhotoId ?? firstPublishedPhotoId,
    };

    return ok();
  }

  // Volta a rascunho: sai do site, mas as fotos continuam publicadas.
  unpublish(): Result<void, AlbumTransitionError> {
    if (this.state.status !== 'PUBLISHED') {
      return err(this.state.status === 'ARCHIVED' ? 'album_archived' : 'invalid_album_status');
    }

    this.state = { ...this.state, status: 'DRAFT', publishedAt: null };

    return ok();
  }

  archive(): Result<void, AlbumTransitionError> {
    if (this.state.status !== 'DRAFT') {
      return err(this.state.status === 'ARCHIVED' ? 'album_archived' : 'invalid_album_status');
    }

    this.state = { ...this.state, status: 'ARCHIVED' };

    return ok();
  }

  restore(): Result<void, AlbumTransitionError> {
    if (this.state.status !== 'ARCHIVED') {
      return err('invalid_album_status');
    }

    this.state = { ...this.state, status: 'DRAFT' };

    return ok();
  }

  // A foto precisa ser uma foto publicada do próprio álbum (conferido pela Application).
  setCover(photoId: string): Result<void, 'album_archived'> {
    if (this.state.status === 'ARCHIVED') {
      return err('album_archived');
    }

    this.state = { ...this.state, coverPhotoId: photoId };

    return ok();
  }

  // A capa deixou de ser publicada (ou foi excluída): assume a próxima foto publicada, se houver.
  replaceCover(photoId: string, nextPhotoId: string | null): boolean {
    if (this.state.coverPhotoId !== photoId) {
      return false;
    }

    this.state = { ...this.state, coverPhotoId: nextPhotoId };

    return true;
  }

  toSnapshot(): AlbumSnapshot {
    return { ...this.state };
  }
}
