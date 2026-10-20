import { describe, expect, it } from 'vitest';
import { EmailAddress, PhoneNumber } from '../../../../shared/domain/value-objects/contact.js';
import { Cnpj } from './cnpj.js';
import { InstitutionalCode, InstitutionalName } from './institutional.js';
import { PostalAddress } from './postal-address.js';

const valueOf = <T extends { value: string }>(result: { ok: true; value: T } | { ok: false }) =>
  result.ok ? result.value.value : null;

describe('Cnpj', () => {
  it('deve aceitar o CNPJ da Matriz com ou sem máscara, guardando somente os dígitos', () => {
    expect(valueOf(Cnpj.create('14.158.325/0001-01'))).toBe('14158325000101');

    expect(valueOf(Cnpj.create('14158325000101'))).toBe('14158325000101');
  });

  it.each([
    ['dígito verificador incorreto', '14.158.325/0001-02'],
    ['segundo dígito verificador incorreto', '14.158.325/0001-00'],
    ['dígitos repetidos', '11.111.111/1111-11'],
    ['tamanho incorreto', '1415832500010'],
    ['letras', '14.158.325/0001-AB'],
  ])('deve recusar %s', (_caso, raw) => {
    expect(Cnpj.create(raw).ok).toBe(false);
  });
});

describe('EmailAddress', () => {
  it('deve normalizar para minúsculas sem espaços', () => {
    expect(valueOf(EmailAddress.create('  ComViVaTI@Gmail.com '))).toBe('comvivati@gmail.com');
  });

  it.each(['sem-arroba', 'a@b', `${'a'.repeat(250)}@exemplo.com`])('deve recusar %s', (raw) => {
    expect(EmailAddress.create(raw).ok).toBe(false);
  });
});

describe('PhoneNumber', () => {
  it.each([
    ['(67)99255-0858', '67992550858'],
    ['(67) 3333-4444', '6733334444'],
  ])('deve aceitar %s', (raw, expected) => {
    expect(valueOf(PhoneNumber.create(raw))).toBe(expected);
  });

  it.each(['0799255085', '6799255085', '671234567', '(67) 1333-4444'])('deve recusar %s', (raw) => {
    expect(PhoneNumber.create(raw).ok).toBe(false);
  });
});

describe('InstitutionalName e InstitutionalCode', () => {
  it('deve colapsar espaços do nome e recusar nomes vazios ou longos', () => {
    expect(valueOf(InstitutionalName.create('  Igreja   Viva '))).toBe('Igreja Viva');

    expect(InstitutionalName.create('   ').ok).toBe(false);

    expect(InstitutionalName.create('a'.repeat(201)).ok).toBe(false);
  });

  it('deve normalizar o código para maiúsculas e recusar formatos inválidos', () => {
    expect(valueOf(InstitutionalCode.create(' cg-norte '))).toBe('CG-NORTE');

    for (const raw of ['A', '-SEDE', 'SEDE-', 'SE DE', 'A'.repeat(21)]) {
      expect(InstitutionalCode.create(raw).ok).toBe(false);
    }
  });
});

const address = {
  street: ' Av.  Roseira ',
  number: '1684',
  complement: '  ',
  district: 'Parque Residencial dos Girassóis',
  city: 'Campo Grande',
  state: 'ms',
  postalCode: '79091-848',
};

describe('PostalAddress', () => {
  it('deve normalizar CEP, UF, espaços e complemento vazio', () => {
    const result = PostalAddress.create(address);

    expect(result.ok && result.value.toProps()).toEqual({
      ...address,
      street: 'Av. Roseira',
      complement: null,
      state: 'MS',
      postalCode: '79091848',
    });
  });

  it('deve listar todos os campos inválidos', () => {
    const result = PostalAddress.create({
      street: '',
      number: '',
      complement: 'x'.repeat(101),
      district: '',
      city: '',
      state: 'XX',
      postalCode: '123',
    });

    expect(!result.ok && result.error).toEqual([
      'street',
      'number',
      'complement',
      'district',
      'city',
      'state',
      'postalCode',
    ]);
  });
});
