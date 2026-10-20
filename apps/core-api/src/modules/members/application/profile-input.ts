import { err, ok, type Result } from '../../../shared/domain/result.js';
import { EmailAddress, PhoneNumber } from '../../../shared/domain/value-objects/contact.js';
import { BirthDate } from '../domain/value-objects/birth-date.js';
import { PersonName } from '../domain/value-objects/person-name.js';
import type { PersonProfile } from '../domain/person.js';

// Dados pessoais como chegam do transporte. Opcionais vazios ou null ficam sem valor.
export interface PersonProfileInput {
  fullName: string;
  birthDate: string | null;
  phone: string | null;
  email: string | null;
}

const isBlank = (raw: string | null): raw is null => raw === null || raw.trim() === '';

// Constrói os Value Objects e acumula os campos recusados, no formato de caminho do contrato.
export const buildPersonProfile = (
  input: PersonProfileInput,
  today: string,
): Result<PersonProfile, string[]> => {
  const invalid: string[] = [];

  const take = <T>(field: string, result: Result<T, unknown>): T | null => {
    if (result.ok) {
      return result.value;
    }

    invalid.push(field);

    return null;
  };

  const profile = {
    fullName: take('fullName', PersonName.create(input.fullName)),
    birthDate: isBlank(input.birthDate)
      ? null
      : take('birthDate', BirthDate.create(input.birthDate, today)),
    phone: isBlank(input.phone) ? null : take('phone', PhoneNumber.create(input.phone)),
    email: isBlank(input.email) ? null : take('email', EmailAddress.create(input.email)),
  };

  return invalid.length > 0 ? err(invalid) : ok(profile as PersonProfile);
};
