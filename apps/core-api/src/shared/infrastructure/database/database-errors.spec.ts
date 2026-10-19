import { describe, expect, it } from 'vitest';
import { isUniqueViolation } from './database-errors.js';

describe('isUniqueViolation', () => {
  it('deve reconhecer o SQLSTATE 23505 no erro ou na causa encapsulada', () => {
    expect(isUniqueViolation(Object.assign(new Error('pg'), { code: '23505' }))).toBe(true);

    expect(isUniqueViolation(new Error('drizzle', { cause: { code: '23505' } }))).toBe(true);
  });

  it.each([
    ['outro SQLSTATE', new Error('pg', { cause: { code: '23503' } })],
    ['causa nula', new Error('pg', { cause: null })],
    ['valor que não é Error', { code: '23505' }],
  ])('deve recusar %s', (_caso, error) => {
    expect(isUniqueViolation(error)).toBe(false);
  });
});
