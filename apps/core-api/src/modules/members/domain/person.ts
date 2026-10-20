import type { EmailAddress, PhoneNumber } from '../../../shared/domain/value-objects/contact.js';
import type { BirthDate } from './value-objects/birth-date.js';
import type { PersonName } from './value-objects/person-name.js';

// Dados pessoais da Pessoa no MVP. O cadastro completo (endereço, foto, redes sociais,
// dependentes...) vem com a tela de edição da Pessoa.
export interface PersonProfile {
  fullName: PersonName;
  birthDate: BirthDate | null;
  phone: PhoneNumber | null;
  email: EmailAddress | null;
}

export interface PersonSnapshot {
  id: string;
  // Conta de acesso (BFF) que originou a Pessoa: uma Pessoa por conta.
  accountId: string;
  fullName: string;
  birthDate: string | null;
  phone: string | null;
  email: string | null;
  version: number;
}

// Cadastro completo de uma pessoa. Só existe a partir de uma conta com e-mail verificado (a regra
// é garantida por quem a registra, o BFF) e é a fonte dos dados pessoais exibidos para o membro.
export class Person {
  private constructor(private readonly state: PersonSnapshot) {}

  static register(id: string, accountId: string, profile: PersonProfile): Person {
    return new Person({
      id,
      accountId,
      fullName: profile.fullName.value,
      birthDate: profile.birthDate?.value ?? null,
      phone: profile.phone?.value ?? null,
      email: profile.email?.value ?? null,
      version: 1,
    });
  }

  get id(): string {
    return this.state.id;
  }

  toSnapshot(): PersonSnapshot {
    return { ...this.state };
  }
}
