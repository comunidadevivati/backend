import { err, ok, type Result } from '../../../../shared/domain/result.js';

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/u;

// Data de nascimento no formato ISO (AAAA-MM-DD): data existente, a partir de 1900 e não futura.
// "today" vem de fora (relógio da Application) para o Domain não depender da hora do sistema.
export class BirthDate {
  private constructor(readonly value: string) {}

  static create(raw: string, today: string): Result<BirthDate, 'invalid'> {
    const value = raw.trim();

    const match = ISO_DATE.exec(value);

    if (!match) {
      return err('invalid');
    }

    const [, year, month, day] = match.map(Number);

    const date = new Date(Date.UTC(year ?? 0, (month ?? 0) - 1, day ?? 0));

    // Recusa datas inexistentes que o Date ajustaria (ex.: 2023-02-30 → 2023-03-02).
    const exists = date.toISOString().slice(0, 10) === value;

    return exists && value >= '1900-01-01' && value <= today
      ? ok(new BirthDate(value))
      : err('invalid');
  }
}
