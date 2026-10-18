import { describe, expect, it } from 'vitest';
import { isValidBrazilianPhone } from './brazilian-phone.js';

describe('isValidBrazilianPhone', () => {
  it.each(['67991234567', '6733334444', '11987654321'])('deve aceitar %s', (phone) => {
    expect(isValidBrazilianPhone(phone)).toBe(true);
  });

  it.each([
    ['com máscara', '(67) 99123-4567'],
    ['incompleto', '679912345'],
    ['com DDD inexistente', '20991234567'],
    ['celular sem o 9 inicial', '67891234567'],
    ['fixo começando com 6', '6763334444'],
    ['com dígitos repetidos', '67999999999'],
    ['fixo com dígitos repetidos', '6733333333'],
  ])('deve recusar telefone %s', (_caso, phone) => {
    expect(isValidBrazilianPhone(phone)).toBe(false);
  });
});
