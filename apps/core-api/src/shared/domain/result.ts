// Result Pattern: resultados esperados (validação, conflitos, transições inválidas) são valores,
// não exceções. Exceções ficam reservadas para falhas inesperadas.
export type Result<T, E> = { ok: true; value: T } | { ok: false; error: E };

// Sem argumento produz o sucesso de um Result<void, E>.
export function ok(): { ok: true; value: void };

export function ok<T>(value: T): { ok: true; value: T };

export function ok<T>(value?: T): { ok: true; value: T | undefined } {
  return { ok: true, value };
}

export const err = <E>(error: E): { ok: false; error: E } => ({ ok: false, error });
