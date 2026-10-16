// Telefone brasileiro com DDD: fixo (10 dígitos) ou celular (11 dígitos, começando com 9).
// Espelha src/shared/validation/brazilian-phone.ts do frontend.

// DDDs em uso no Brasil (Anatel).
const VALID_AREA_CODES = new Set([
  11, 12, 13, 14, 15, 16, 17, 18, 19, 21, 22, 24, 27, 28, 31, 32, 33, 34, 35, 37, 38, 41, 42, 43,
  44, 45, 46, 47, 48, 49, 51, 53, 54, 55, 61, 62, 63, 64, 65, 66, 67, 68, 69, 71, 73, 74, 75, 77,
  79, 81, 82, 83, 84, 85, 86, 87, 88, 89, 91, 92, 93, 94, 95, 96, 97, 98, 99,
]);

// Recebe somente dígitos (o contrato do cadastro exige o telefone já sem máscara).
export const isValidBrazilianPhone = (digits: string): boolean => {
  if (!/^\d{10,11}$/u.test(digits) || !VALID_AREA_CODES.has(Number(digits.slice(0, 2)))) {
    return false;
  }

  const number = digits.slice(2);

  // Celular: 9 + 8 dígitos. Fixo: começa com 2 a 5.
  const isMobile = number.length === 9 && number.startsWith('9');

  const isLandline = number.length === 8 && /^[2-5]/u.test(number);

  // Números com todos os dígitos iguais (ex.: 99999-9999) não existem.
  return (isMobile || isLandline) && !/^(\d)\1+$/u.test(number.slice(isMobile ? 1 : 0));
};
