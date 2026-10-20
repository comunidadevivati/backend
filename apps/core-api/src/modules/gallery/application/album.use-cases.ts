import { err, ok, type Result } from '../../../shared/domain/result.js';
import { Album, type AlbumDetails, type AlbumStatus } from '../domain/album.js';
import {
  AlbumDescription,
  AlbumTitle,
  OccurrenceDate,
  albumSlug,
} from '../domain/value-objects/album-details.js';
import {
  albumArchived,
  invalidFields,
  notFound,
  versionConflict,
  type GalleryError,
} from './gallery-errors.js';
import type { AlbumRepository, AlbumView, Clock, IdGenerator } from './ports.js';

// Dados do álbum como chegam do transporte. Descrição vazia ou null fica sem valor.
export interface AlbumDetailsInput {
  title: string;
  description: string | null;
  occurredOn: string;
}

export interface ListAlbumsQuery {
  status: AlbumStatus | null;
  cursor: string | null;
  limit: number;
}

export interface AlbumPage {
  items: AlbumView[];
  nextCursor: string | null;
}

export interface UpdateAlbumCommand {
  id: string;
  expectedVersion: number;
  details: { [K in keyof AlbumDetailsInput]?: AlbumDetailsInput[K] | undefined };
}

type AlbumResult = Result<AlbumView, GalleryError>;

// Tentativas de slug com sufixo numérico quando o mesmo título e data já existem.
const MAX_SLUG_ATTEMPTS = 20;

const buildDetails = (input: AlbumDetailsInput, today: string): Result<AlbumDetails, string[]> => {
  const title = AlbumTitle.create(input.title);

  const occurredOn = OccurrenceDate.create(input.occurredOn, today);

  const description =
    input.description === null || input.description.trim() === ''
      ? ok(null)
      : AlbumDescription.create(input.description);

  if (!title.ok || !description.ok || !occurredOn.ok) {
    return err([
      ...(title.ok ? [] : ['title']),
      ...(description.ok ? [] : ['description']),
      ...(occurredOn.ok ? [] : ['occurredOn']),
    ]);
  }

  return ok({ title: title.value, description: description.value, occurredOn: occurredOn.value });
};

export class ListAlbumsUseCase {
  constructor(private readonly albums: AlbumRepository) {}

  // Paginação por cursor: busca um item a mais para saber se existe a próxima página.
  async execute({ cursor, limit, status }: ListAlbumsQuery): Promise<AlbumPage> {
    const rows = await this.albums.list({ status, after: cursor, limit: limit + 1 });

    const items = rows.slice(0, limit);

    return {
      items,
      nextCursor: rows.length > limit ? (items.at(-1)?.id ?? null) : null,
    };
  }
}

export class GetAlbumUseCase {
  constructor(private readonly albums: AlbumRepository) {}

  async execute(id: string): Promise<AlbumResult> {
    const album = await this.albums.findView(id);

    return album ? ok(album) : err(notFound);
  }
}

// O álbum nasce DRAFT, com slug derivado da data e do título.
export class CreateAlbumUseCase {
  constructor(
    private readonly albums: AlbumRepository,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
  ) {}

  async execute(input: AlbumDetailsInput): Promise<AlbumResult> {
    const details = buildDetails(input, this.clock.today());

    if (!details.ok) {
      return err(invalidFields(details.error));
    }

    const base = albumSlug(details.value.occurredOn, details.value.title);

    const id = this.ids.next();

    for (let attempt = 1; attempt <= MAX_SLUG_ATTEMPTS; attempt += 1) {
      const slug = attempt === 1 ? base : `${base}-${attempt}`;

      // oxlint-disable-next-line no-await-in-loop -- tentativas sucessivas até o slug ficar livre
      if ((await this.albums.insert(Album.create(id, slug, details.value))) === 'inserted') {
        return this.view(id);
      }
    }

    return err(invalidFields(['title']));
  }

  private async view(id: string): Promise<AlbumResult> {
    const album = await this.albums.findView(id);

    return album ? ok(album) : err(notFound);
  }
}

// Alteração parcial com controle otimista; o slug é mantido.
export class UpdateAlbumUseCase {
  constructor(
    private readonly albums: AlbumRepository,
    private readonly clock: Clock,
  ) {}

  async execute({ details, expectedVersion, id }: UpdateAlbumCommand): Promise<AlbumResult> {
    const album = await this.albums.findById(id);

    if (!album) {
      return err(notFound);
    }

    if (album.version !== expectedVersion) {
      return err(versionConflict);
    }

    const { description, occurredOn, title } = album.toSnapshot();

    const merged = buildDetails(
      {
        title: details.title ?? title,
        description: details.description === undefined ? description : details.description,
        occurredOn: details.occurredOn ?? occurredOn,
      },
      this.clock.today(),
    );

    if (!merged.ok) {
      return err(invalidFields(merged.error));
    }

    if (!album.updateDetails(merged.value).ok) {
      return err(albumArchived);
    }

    if ((await this.albums.update(album)) === null) {
      return err(versionConflict);
    }

    const view = await this.albums.findView(id);

    return view ? ok(view) : err(notFound);
  }
}
