// Política de senha do cadastro. Espelha src/shared/validation/password-strength.ts do frontend:
// toda senha aceita pela tela também é aceita aqui, e o servidor recusa as fracas mesmo sem a UI.

const PASSWORD_MIN_LENGTH = 8;

export const PASSWORD_MAX_LENGTH = 64;

// Trechos óbvios que tornam qualquer senha fraca, mesmo combinados com números e símbolos.
const COMMON_PASSWORD_TERMS = [
  'password',
  'senha',
  'qwerty',
  'asdf',
  'abc123',
  'admin',
  'welcome',
  'iloveyou',
  'teamo',
  'mudar',
  'comunidade',
  'viva',
  'eficaz',
  'igreja',
  'jesus',
  'deus',
];

// Partículas de nomes que não identificam a pessoa.
const NAME_PARTICLES = new Set(['das', 'dos', 'del', 'van', 'von']);

const SEQUENCE_LENGTH = 4;

const CHARACTER_CLASS_TESTS = [
  (password: string) => /\p{Ll}/u.test(password),
  (password: string) => /\p{Lu}/u.test(password),
  (password: string) => /\d/u.test(password),
  (password: string) => /[^\p{L}\d]/u.test(password),
];

const normalize = (value: string): string =>
  value
    .normalize('NFD')
    .replaceAll(/\p{Diacritic}/gu, '')
    .toLocaleLowerCase();

// Sequências como "1234", "abcd" ou "4321".
const hasSequence = (password: string): boolean => {
  const codes = [...normalize(password)].map((char) => char.codePointAt(0) ?? 0);

  for (let start = 0; start <= codes.length - SEQUENCE_LENGTH; start += 1) {
    const window = codes.slice(start, start + SEQUENCE_LENGTH);

    const steps = window.slice(1).map((code, index) => code - (window[index] ?? 0));

    if (steps.every((step) => step === 1) || steps.every((step) => step === -1)) {
      return true;
    }
  }

  return false;
};

// Mesmo caractere repetido 3 vezes ou mais (ex.: "aaa", "111").
const hasRepetition = (password: string): boolean => /(.)\1{2,}/u.test(password);

const containsCommonTerm = (password: string): boolean => {
  const value = normalize(password).replaceAll(/[^a-z]/gu, '');

  return COMMON_PASSWORD_TERMS.some((term) => value.includes(term));
};

// Dados pessoais (nome, partes do e-mail) com 3+ caracteres não podem aparecer na senha.
const containsPersonalInfo = (password: string, personalInfo: string[]): boolean => {
  const value = normalize(password);

  return personalInfo
    .map((info) => normalize(info))
    .filter((info) => info.length >= 3 && !NAME_PARTICLES.has(info))
    .some((info) => value.includes(info));
};

export const hasEdgeWhitespace = (password: string): boolean => password !== password.trim();

// Partes do nome e do usuário do e-mail (antes do @) que não devem aparecer na senha.
export const getPersonalInfoTerms = (fullName: string, email: string): string[] => {
  const [emailUser = ''] = email.split('@');

  return [...fullName.split(/\s+/u), ...emailUser.split(/[._+-]+/u)].filter(Boolean);
};

export const isWeakPassword = (password: string, personalInfo: string[] = []): boolean => {
  const characterClasses = CHARACTER_CLASS_TESTS.filter((test) => test(password)).length;

  if (
    password.length < PASSWORD_MIN_LENGTH ||
    password.length > PASSWORD_MAX_LENGTH ||
    characterClasses < 3 ||
    hasEdgeWhitespace(password) ||
    containsCommonTerm(password) ||
    containsPersonalInfo(password, personalInfo)
  ) {
    return true;
  }

  const score =
    characterClasses +
    (password.length >= 12 ? 1 : 0) +
    (password.length >= 16 ? 1 : 0) -
    (hasSequence(password) ? 1 : 0) -
    (hasRepetition(password) ? 1 : 0);

  return score < 3;
};
