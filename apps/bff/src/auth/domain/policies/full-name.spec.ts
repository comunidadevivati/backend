import { describe, expect, it } from 'vitest';
import { isValidFullName, normalizeFullName } from './full-name.js';

describe('normalizeFullName', () => {
  it('deve remover espaços nas pontas e colapsar espaços internos', () => {
    expect(normalizeFullName('  Maria   da  Silva ')).toBe('Maria da Silva');
  });
});

describe('isValidFullName', () => {
  it.each(["Maria D'Ávila Santos-Lima", 'Jo Li', 'José A. Souza'])('deve aceitar %s', (name) => {
    expect(isValidFullName(name)).toBe(true);
  });

  it.each([
    ['sem sobrenome', 'Maria'],
    ['com primeiro nome de uma letra', 'J Silva'],
    ['com último nome de uma letra', 'Maria S.'],
    ['com números', 'Maria Silva 2'],
    ['longo demais', `Maria ${'a'.repeat(120)}`],
  ])('deve recusar nome %s', (_caso, name) => {
    expect(isValidFullName(name)).toBe(false);
  });
});
