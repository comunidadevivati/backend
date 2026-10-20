import { err, ok, type Result } from '../../../../shared/domain/result.js';

// Letras (com acento), espaço, apóstrofo, ponto e hífen (ex.: "Maria D'Ávila Santos-Lima").
const NAME_PATTERN = /^[\p{L}\p{M}' .-]+$/u;

// Nome completo da pessoa: espaços colapsados, de 2 a 120 caracteres, com ao menos uma letra.
export class PersonName {
  private constructor(readonly value: string) {}

  static create(raw: string): Result<PersonName, 'invalid'> {
    const value = raw.trim().replaceAll(/\s+/gu, ' ');

    return value.length >= 2 &&
      value.length <= 120 &&
      NAME_PATTERN.test(value) &&
      /\p{L}/u.test(value)
      ? ok(new PersonName(value))
      : err('invalid');
  }
}
