import { err, ok, type Result } from '../../../shared/domain/result.js';
import { EmailAddress, PhoneNumber } from '../../../shared/domain/value-objects/contact.js';
import { BirthDate } from '../domain/value-objects/birth-date.js';
import { HomeAddress, type HomeAddressProps } from '../domain/value-objects/home-address.js';
import { PersonName } from '../domain/value-objects/person-name.js';
import { SocialLinks, type SocialLinksProps } from '../domain/value-objects/social-links.js';
import type { PersonDetails, PersonProfile, Sex } from '../domain/person.js';

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

// Cadastro do Perfil como chega do transporte (sem o e-mail principal, que é o da conta).
export interface PersonDetailsInput {
  fullName: string;
  sex: Sex | null;
  birthDate: string | null;
  phone: string | null;
  secondaryPhone: string | null;
  secondaryEmail: string | null;
  address: HomeAddressProps | null;
  socialLinks: SocialLinksProps;
}

export const buildPersonDetails = (
  input: PersonDetailsInput,
  today: string,
): Result<PersonDetails, string[]> => {
  const base = buildPersonProfile({ ...input, email: input.secondaryEmail }, today);

  // O e-mail validado acima é o secundário: o principal não muda pelo Perfil.
  const invalid = base.ok
    ? []
    : base.error.map((field) => (field === 'email' ? 'secondaryEmail' : field));

  const secondaryPhone = isBlank(input.secondaryPhone)
    ? null
    : PhoneNumber.create(input.secondaryPhone);

  if (secondaryPhone && !secondaryPhone.ok) {
    invalid.push('secondaryPhone');
  }

  const address = input.address === null ? null : HomeAddress.create(input.address);

  if (address && !address.ok) {
    invalid.push(...address.error.map((field) => `address.${field}`));
  }

  const socialLinks = SocialLinks.create(input.socialLinks);

  if (!socialLinks.ok) {
    invalid.push(...socialLinks.error.map((network) => `socialLinks.${network}`));
  }

  if (!base.ok || invalid.length > 0) {
    return err(invalid);
  }

  return ok({
    fullName: base.value.fullName,
    sex: input.sex,
    birthDate: base.value.birthDate,
    phone: base.value.phone,
    secondaryPhone: secondaryPhone?.ok ? secondaryPhone.value : null,
    secondaryEmail: base.value.email,
    address: address?.ok ? address.value : null,
    socialLinks: socialLinks.ok ? socialLinks.value : SocialLinks.empty(),
  });
};
