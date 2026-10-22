import { err, ok, type Result } from '../../../../shared/domain/result.js';

const BRAZIL = 'Brasil';

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

export interface HomeAddressProps {
  street: string;
  number: string;
  complement: string | null;
  district: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  // Ponto de referência para chegar ao endereço.
  reference: string | null;
}

export type HomeAddressField = keyof HomeAddressProps;

const collapse = (value: string): string => value.trim().replaceAll(/\s+/gu, ' ');

const optional = (value: string | null): string | null => {
  const collapsed = value === null ? '' : collapse(value);

  return collapsed === '' ? null : collapsed;
};

const isText = (value: string, max: number): boolean => value.length > 0 && value.length <= max;

const isBrazil = (country: string): boolean =>
  country
    .normalize('NFD')
    .replaceAll(/\p{Diacritic}/gu, '')
    .toLowerCase() === 'brasil';

// Endereço residencial da Pessoa. No Brasil, CEP com 8 dígitos e UF válida; em outro país, estado e
// código postal são texto livre. País vazio é tratado como Brasil.
export class HomeAddress {
  private constructor(private readonly props: HomeAddressProps) {}

  static create(raw: HomeAddressProps): Result<HomeAddress, HomeAddressField[]> {
    const country = collapse(raw.country) || BRAZIL;

    const brazil = isBrazil(country);

    const props: HomeAddressProps = {
      street: collapse(raw.street),
      number: collapse(raw.number),
      complement: optional(raw.complement),
      district: collapse(raw.district),
      city: collapse(raw.city),
      state: brazil ? raw.state.trim().toUpperCase() : collapse(raw.state),
      postalCode: brazil ? raw.postalCode.replaceAll(/[.\-\s]/gu, '') : collapse(raw.postalCode),
      country: brazil ? BRAZIL : country,
      reference: optional(raw.reference),
    };

    const invalid: HomeAddressField[] = [];

    const check = (field: HomeAddressField, valid: boolean) => {
      if (!valid) {
        invalid.push(field);
      }
    };

    check('street', isText(props.street, 200));

    check('number', isText(props.number, 20));

    check('complement', (props.complement?.length ?? 0) <= 100);

    check('district', isText(props.district, 100));

    check('city', isText(props.city, 100));

    check('state', brazil ? BRAZILIAN_STATES.has(props.state) : isText(props.state, 100));

    check('postalCode', brazil ? /^\d{8}$/u.test(props.postalCode) : isText(props.postalCode, 20));

    check('country', isText(props.country, 60));

    check('reference', (props.reference?.length ?? 0) <= 200);

    return invalid.length > 0 ? err(invalid) : ok(new HomeAddress(props));
  }

  toProps(): HomeAddressProps {
    return { ...this.props };
  }
}
