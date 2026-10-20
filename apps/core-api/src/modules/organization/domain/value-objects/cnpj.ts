import { err, ok, type Result } from '../../../../shared/domain/result.js';

const FIRST_DIGIT_WEIGHTS = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];

const SECOND_DIGIT_WEIGHTS = [6, ...FIRST_DIGIT_WEIGHTS];

const checkDigit = (digits: readonly number[], weights: readonly number[]): number => {
  const remainder =
    weights.reduce((sum, weight, index) => sum + weight * (digits[index] ?? 0), 0) % 11;

  return remainder < 2 ? 0 : 11 - remainder;
};

// CNPJ numérico (14 dígitos) com dígitos verificadores válidos. Aceita a máscara
// 00.000.000/0000-00 na entrada e guarda somente os dígitos.
export class Cnpj {
  private constructor(readonly value: string) {}

  static create(raw: string): Result<Cnpj, 'invalid'> {
    const value = raw.replaceAll(/[.\-/\s]/gu, '');

    if (!/^\d{14}$/u.test(value) || /^(\d)\1{13}$/u.test(value)) {
      return err('invalid');
    }

    const digits = [...value].map(Number);

    if (
      checkDigit(digits, FIRST_DIGIT_WEIGHTS) !== digits[12] ||
      checkDigit(digits, SECOND_DIGIT_WEIGHTS) !== digits[13]
    ) {
      return err('invalid');
    }

    return ok(new Cnpj(value));
  }
}
