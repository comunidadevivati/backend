import { err, ok, type Result } from '../../../../shared/domain/result.js';

// Título do álbum (ex.: "Culto de Domingo"): espaços colapsados, de 1 a 120 caracteres.
export class AlbumTitle {
  private constructor(readonly value: string) {}

  static create(raw: string): Result<AlbumTitle, 'invalid'> {
    const value = raw.trim().replaceAll(/\s+/gu, ' ');

    return value.length > 0 && value.length <= 120 ? ok(new AlbumTitle(value)) : err('invalid');
  }
}

// Descrição opcional, até 2000 caracteres; quebras de linha são preservadas.
export class AlbumDescription {
  private constructor(readonly value: string) {}

  static create(raw: string): Result<AlbumDescription, 'invalid'> {
    const value = raw.trim();

    return value.length > 0 && value.length <= 2000
      ? ok(new AlbumDescription(value))
      : err('invalid');
  }
}

// Data civil do culto ou evento (AAAA-MM-DD), existente, de 2000 até hoje.
export class OccurrenceDate {
  private constructor(readonly value: string) {}

  static create(raw: string, today: string): Result<OccurrenceDate, 'invalid'> {
    const value = raw.trim();

    if (!/^\d{4}-\d{2}-\d{2}$/u.test(value)) {
      return err('invalid');
    }

    const date = new Date(`${value}T00:00:00Z`);

    const exists = !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;

    return exists && value >= '2000-01-01' && value <= today
      ? ok(new OccurrenceDate(value))
      : err('invalid');
  }
}

// Identificador legível e estável da URL pública do álbum, a partir da data e do título
// (ex.: 2026-10-19-culto-de-domingo). Não muda quando o título muda.
export const albumSlug = (occurredOn: OccurrenceDate, title: AlbumTitle): string => {
  const words = title.value
    .normalize('NFD')
    .replaceAll(/\p{M}/gu, '')
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/gu, '-')
    .replaceAll(/^-+|-+$/gu, '')
    .slice(0, 80)
    .replace(/-+$/u, '');

  return words ? `${occurredOn.value}-${words}` : occurredOn.value;
};
