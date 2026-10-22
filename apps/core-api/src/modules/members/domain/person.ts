import { SocialLinks, type SocialLinksProps } from './value-objects/social-links.js';
import type { EmailAddress, PhoneNumber } from '../../../shared/domain/value-objects/contact.js';
import type { BirthDate } from './value-objects/birth-date.js';
import type { HomeAddress, HomeAddressProps } from './value-objects/home-address.js';
import type { PersonName } from './value-objects/person-name.js';

export const SEXES = ['MALE', 'FEMALE'] as const;

export type Sex = (typeof SEXES)[number];

// Dados da conta verificada que originam a Pessoa, ao virar membro.
export interface PersonProfile {
  fullName: PersonName;
  birthDate: BirthDate | null;
  phone: PhoneNumber | null;
  email: EmailAddress | null;
}

// Cadastro editado pela própria pessoa no Perfil. O e-mail principal é o e-mail de acesso da conta e
// só muda pela troca de e-mail (confirmada no novo endereço); a foto tem fluxo próprio.
export interface PersonDetails {
  fullName: PersonName;
  sex: Sex | null;
  birthDate: BirthDate | null;
  phone: PhoneNumber | null;
  secondaryPhone: PhoneNumber | null;
  // Não exige verificação.
  secondaryEmail: EmailAddress | null;
  address: HomeAddress | null;
  socialLinks: SocialLinks;
}

export interface PersonSnapshot {
  id: string;
  // Conta de acesso (BFF) que originou a Pessoa: uma Pessoa por conta.
  accountId: string;
  fullName: string;
  sex: Sex | null;
  birthDate: string | null;
  phone: string | null;
  secondaryPhone: string | null;
  email: string | null;
  secondaryEmail: string | null;
  address: HomeAddressProps | null;
  socialLinks: SocialLinksProps;
  // Identificador da foto atual no armazenamento de mídia; nulo sem foto.
  avatarKey: string | null;
  version: number;
}

// Cadastro completo de uma pessoa. Só existe a partir de uma conta com e-mail verificado (a regra
// é garantida por quem a registra, o BFF) e é a fonte dos dados pessoais exibidos para o membro.
export class Person {
  private constructor(private state: PersonSnapshot) {}

  static register(id: string, accountId: string, profile: PersonProfile): Person {
    return new Person({
      id,
      accountId,
      fullName: profile.fullName.value,
      sex: null,
      birthDate: profile.birthDate?.value ?? null,
      phone: profile.phone?.value ?? null,
      secondaryPhone: null,
      email: profile.email?.value ?? null,
      secondaryEmail: null,
      address: null,
      socialLinks: SocialLinks.empty().toProps(),
      avatarKey: null,
      version: 1,
    });
  }

  static restore(snapshot: PersonSnapshot): Person {
    return new Person({ ...snapshot });
  }

  get id(): string {
    return this.state.id;
  }

  get version(): number {
    return this.state.version;
  }

  get avatarKey(): string | null {
    return this.state.avatarKey;
  }

  updateDetails(details: PersonDetails): void {
    this.state = {
      ...this.state,
      fullName: details.fullName.value,
      sex: details.sex,
      birthDate: details.birthDate?.value ?? null,
      phone: details.phone?.value ?? null,
      secondaryPhone: details.secondaryPhone?.value ?? null,
      secondaryEmail: details.secondaryEmail?.value ?? null,
      address: details.address?.toProps() ?? null,
      socialLinks: details.socialLinks.toProps(),
    };
  }

  // Acompanha a troca do e-mail de acesso da conta, já confirmada no novo endereço.
  changeEmail(email: EmailAddress): void {
    this.state = { ...this.state, email: email.value };
  }

  // Troca a foto e devolve o identificador da anterior, para apagá-la do armazenamento.
  replaceAvatar(avatarKey: string): string | null {
    return this.setAvatar(avatarKey);
  }

  removeAvatar(): string | null {
    return this.setAvatar(null);
  }

  toSnapshot(): PersonSnapshot {
    return {
      ...this.state,
      address: this.state.address ? { ...this.state.address } : null,
      socialLinks: { ...this.state.socialLinks },
    };
  }

  private setAvatar(avatarKey: string | null): string | null {
    const previous = this.state.avatarKey;

    this.state = { ...this.state, avatarKey };

    return previous;
  }
}
