import { describe, expect, it } from 'vitest';
import { getPersonalInfoTerms, hasEdgeWhitespace, isWeakPassword } from './password-policy.js';

describe('isWeakPassword — senhas aceitas', () => {
  it.each(['Diversos@@2026', 'Tr0ca-Rapida!', 'xK9#mPq2Lw'])('deve aceitar %s', (password) => {
    expect(isWeakPassword(password)).toBe(false);
  });
});

describe('isWeakPassword — senhas recusadas', () => {
  it.each([
    ['curta', 'Ab1!xyz'],
    ['longa demais', `Ab1!${'x'.repeat(61)}`],
    ['com menos de 3 tipos de caractere', 'abcdefgh12'],
    ['com espaço nas pontas', ' Diversos@2026'],
    ['com termo óbvio', 'MinhaSenha#91'],
    ['com termo óbvio acentuado', 'IgrÉja#2026x'],
    ['com sequência e repetição', 'Abcd1111!'],
  ])('deve recusar senha %s', (_caso, password) => {
    expect(isWeakPassword(password)).toBe(true);
  });

  it('deve recusar dados pessoais e ignorar partículas de nomes', () => {
    const terms = getPersonalInfoTerms('Ana dos Santos', 'ana.santos@exemplo.com');

    expect(isWeakPassword('Santos#2026x', terms)).toBe(true);

    expect(isWeakPassword('Kdos#2026xY', terms)).toBe(false);
  });

  it('deve tratar sequências decrescentes como fracas', () => {
    // 4 tipos de caractere, mas a sequência "zyxw" e a repetição "111" derrubam a pontuação.
    expect(isWeakPassword('Zyxw111#')).toBe(true);
  });
});

describe('getPersonalInfoTerms', () => {
  it('deve separar as palavras do nome e as partes do usuário do e-mail', () => {
    expect(getPersonalInfoTerms('Maria Silva', 'maria_s+igreja@x.com')).toEqual([
      'Maria',
      'Silva',
      'maria',
      's',
      'igreja',
    ]);
  });

  it('deve tolerar e-mail vazio', () => {
    expect(getPersonalInfoTerms('Maria Silva', '')).toEqual(['Maria', 'Silva']);
  });
});

describe('hasEdgeWhitespace', () => {
  it('deve identificar espaços nas pontas', () => {
    expect(hasEdgeWhitespace('senha ')).toBe(true);

    expect(hasEdgeWhitespace('sen ha')).toBe(false);
  });
});
