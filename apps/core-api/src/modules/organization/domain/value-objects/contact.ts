import { err, ok, type Result } from '../../../../shared/domain/result.js';

// E-mail institucional, normalizado (trim + minúsculas).
export class EmailAddress {
  private constructor(readonly value: string) {}

  static create(raw: string): Result<EmailAddress, 'invalid'> {
    const value = raw.trim().toLowerCase();

    if (value.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(value)) {
      return err('invalid');
    }

    return ok(new EmailAddress(value));
  }
}

// Telefone brasileiro com DDD, guardado somente com dígitos: fixo (10) ou celular (11, iniciado
// por 9). Aceita máscara como (67) 99255-0858 na entrada.
export class PhoneNumber {
  private constructor(readonly value: string) {}

  static create(raw: string): Result<PhoneNumber, 'invalid'> {
    const value = raw.replaceAll(/[\s()+-]/gu, '');

    if (!/^[1-9]{2}(?:9\d{8}|[2-8]\d{7})$/u.test(value)) {
      return err('invalid');
    }

    return ok(new PhoneNumber(value));
  }
}
