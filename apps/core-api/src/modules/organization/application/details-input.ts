import { err, ok, type Result } from '../../../shared/domain/result.js';
import { Cnpj } from '../domain/value-objects/cnpj.js';
import { EmailAddress, PhoneNumber } from '../domain/value-objects/contact.js';
import { InstitutionalName } from '../domain/value-objects/institutional.js';
import { PostalAddress, type PostalAddressProps } from '../domain/value-objects/postal-address.js';
import type { CongregationDetails } from '../domain/congregation.js';
import type { OrganizationDetails } from '../domain/organization.js';

export type AddressInput = PostalAddressProps;

export interface OrganizationDetailsInput {
  legalName: string;
  tradeName: string;
  cnpj: string;
  address: AddressInput;
  phone: string;
  email: string;
}

export interface CongregationDetailsInput {
  name: string;
  cnpj: string | null;
  address: AddressInput;
  phone: string | null;
  email: string | null;
}

// Alteração parcial: campos ausentes mantêm o valor atual; no endereço, também campo a campo.
type Patch<T> = { [K in keyof T]?: T[K] | undefined };

export type DetailsPatch<T extends { address: AddressInput }> = Patch<Omit<T, 'address'>> & {
  address?: Patch<AddressInput> | undefined;
};

export type OrganizationPatch = DetailsPatch<OrganizationDetailsInput>;

export type CongregationPatch = DetailsPatch<CongregationDetailsInput>;

const definedEntries = (patch: object): object =>
  Object.fromEntries(Object.entries(patch).filter(([, value]) => value !== undefined));

export const mergePatch = <T extends { address: AddressInput }>(
  current: T,
  { address, ...patch }: DetailsPatch<T>,
): T => ({
  ...current,
  ...definedEntries(patch),
  address: { ...current.address, ...definedEntries(address ?? {}) },
});

// Constrói os Value Objects e acumula os campos recusados, no formato de caminho do contrato
// (ex.: address.postalCode).
class DetailsBuilder {
  readonly invalid: string[] = [];

  take<T>(field: string, result: Result<T, unknown>): T | undefined {
    if (result.ok) {
      return result.value;
    }

    this.invalid.push(field);

    return undefined;
  }

  optional<T>(field: string, raw: string | null, create: (value: string) => Result<T, unknown>) {
    return raw === null || raw.trim() === '' ? null : this.take(field, create(raw));
  }

  address(raw: AddressInput): PostalAddress | undefined {
    const result = PostalAddress.create(raw);

    if (result.ok) {
      return result.value;
    }

    this.invalid.push(...result.error.map((field) => `address.${field}`));

    return undefined;
  }
}

export const buildOrganizationDetails = (
  input: OrganizationDetailsInput,
): Result<OrganizationDetails, string[]> => {
  const builder = new DetailsBuilder();

  const details = {
    legalName: builder.take('legalName', InstitutionalName.create(input.legalName)),
    tradeName: builder.take('tradeName', InstitutionalName.create(input.tradeName)),
    cnpj: builder.take('cnpj', Cnpj.create(input.cnpj)),
    address: builder.address(input.address),
    phone: builder.take('phone', PhoneNumber.create(input.phone)),
    email: builder.take('email', EmailAddress.create(input.email)),
  };

  return builder.invalid.length > 0 ? err(builder.invalid) : ok(details as OrganizationDetails);
};

export const buildCongregationDetails = (
  input: CongregationDetailsInput,
): Result<CongregationDetails, string[]> => {
  const builder = new DetailsBuilder();

  const details = {
    name: builder.take('name', InstitutionalName.create(input.name)),
    cnpj: builder.optional('cnpj', input.cnpj, (value) => Cnpj.create(value)),
    address: builder.address(input.address),
    phone: builder.optional('phone', input.phone, (value) => PhoneNumber.create(value)),
    email: builder.optional('email', input.email, (value) => EmailAddress.create(value)),
  };

  return builder.invalid.length > 0 ? err(builder.invalid) : ok(details as CongregationDetails);
};
