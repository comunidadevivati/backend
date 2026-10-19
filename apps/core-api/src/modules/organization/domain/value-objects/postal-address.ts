import { err, ok, type Result } from '../../../../shared/domain/result.js';

const BRAZILIAN_STATES = new Set([
  'AC',
  'AL',
  'AM',
  'AP',
  'BA',
  'CE',
  'DF',
  'ES',
  'GO',
  'MA',
  'MG',
  'MS',
  'MT',
  'PA',
  'PB',
  'PE',
  'PI',
  'PR',
  'RJ',
  'RN',
  'RO',
  'RR',
  'RS',
  'SC',
  'SE',
  'SP',
  'TO',
]);

export interface PostalAddressProps {
  street: string;
  number: string;
  complement: string | null;
  district: string;
  city: string;
  state: string;
  postalCode: string;
}

export type PostalAddressField = keyof PostalAddressProps;

const collapse = (value: string): string => value.trim().replaceAll(/\s+/gu, ' ');

const isText = (value: string, max: number): boolean => value.length > 0 && value.length <= max;

// Endereço brasileiro. CEP guardado com 8 dígitos e UF em maiúsculas.
export class PostalAddress {
  private constructor(private readonly props: PostalAddressProps) {}

  static create(raw: PostalAddressProps): Result<PostalAddress, PostalAddressField[]> {
    const complement = raw.complement === null ? '' : collapse(raw.complement);

    const props: PostalAddressProps = {
      street: collapse(raw.street),
      number: collapse(raw.number),
      complement: complement === '' ? null : complement,
      district: collapse(raw.district),
      city: collapse(raw.city),
      state: raw.state.trim().toUpperCase(),
      postalCode: raw.postalCode.replaceAll(/[.\-\s]/gu, ''),
    };

    const invalid: PostalAddressField[] = [];

    if (!isText(props.street, 200)) {
      invalid.push('street');
    }

    if (!isText(props.number, 20)) {
      invalid.push('number');
    }

    if (complement.length > 100) {
      invalid.push('complement');
    }

    if (!isText(props.district, 100)) {
      invalid.push('district');
    }

    if (!isText(props.city, 100)) {
      invalid.push('city');
    }

    if (!BRAZILIAN_STATES.has(props.state)) {
      invalid.push('state');
    }

    if (!/^\d{8}$/u.test(props.postalCode)) {
      invalid.push('postalCode');
    }

    return invalid.length > 0 ? err(invalid) : ok(new PostalAddress(props));
  }

  toProps(): PostalAddressProps {
    return { ...this.props };
  }
}
