// Nome completo do cadastro. Espelha registerFormSchema (register.model.ts) do frontend.

const FULL_NAME_MAX_LENGTH = 120;

// Letras (com acento), espaço, apóstrofo, hífen e ponto (ex.: "Maria D'Ávila Santos-Lima").
const FULL_NAME_PATTERN = /^[\p{L}\p{M}' .-]+$/u;

const countLetters = (word: string | undefined): number =>
  word?.replaceAll(/\P{L}/gu, '').length ?? 0;

// Remove espaços nas pontas e colapsa espaços internos.
export const normalizeFullName = (value: string): string => value.trim().replaceAll(/\s+/gu, ' ');

// Nome e sobrenome, com pelo menos 2 letras no primeiro e no último. Recebe o nome normalizado.
export const isValidFullName = (name: string): boolean => {
  const words = name.split(' ').filter(Boolean);

  return (
    name.length <= FULL_NAME_MAX_LENGTH &&
    FULL_NAME_PATTERN.test(name) &&
    words.length >= 2 &&
    countLetters(words.at(0)) >= 2 &&
    countLetters(words.at(-1)) >= 2
  );
};
