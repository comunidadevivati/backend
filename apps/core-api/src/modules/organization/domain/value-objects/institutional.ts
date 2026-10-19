import { err, ok, type Result } from '../../../../shared/domain/result.js';

// Nome empresarial, nome fantasia ou nome da congregação: espaços colapsados, até 200 caracteres.
export class InstitutionalName {
  private constructor(readonly value: string) {}

  static create(raw: string): Result<InstitutionalName, 'invalid'> {
    const value = raw.trim().replaceAll(/\s+/gu, ' ');

    return value.length > 0 && value.length <= 200
      ? ok(new InstitutionalName(value))
      : err('invalid');
  }
}

// Código institucional estável da congregação (ex.: SEDE, CG-NORTE). Não muda após o registro,
// mesmo que o nome mude: serve de referência em relatórios e integrações.
export class InstitutionalCode {
  private constructor(readonly value: string) {}

  static create(raw: string): Result<InstitutionalCode, 'invalid'> {
    const value = raw.trim().toUpperCase();

    return /^[A-Z0-9](?:[A-Z0-9-]{0,18}[A-Z0-9])$/u.test(value)
      ? ok(new InstitutionalCode(value))
      : err('invalid');
  }
}
