import { err, ok, type Result } from '../../../shared/domain/result.js';
import type { EmailAddress, PhoneNumber } from '../../../shared/domain/value-objects/contact.js';
import type { BirthDate } from './value-objects/birth-date.js';
import type { PersonName } from './value-objects/person-name.js';

export type MemberStatus = 'ACTIVE' | 'INACTIVE' | 'ARCHIVED';

export type MemberStatusAction = 'activate' | 'deactivate' | 'archive' | 'restore';

export type MemberTransitionError = 'invalid_status_transition';

// Perfil pessoal (PersonProfile) do membro: dados mínimos do MVP.
export interface PersonProfile {
  fullName: PersonName;
  birthDate: BirthDate | null;
  phone: PhoneNumber | null;
  email: EmailAddress | null;
}

export interface MemberSnapshot {
  id: string;
  fullName: string;
  birthDate: string | null;
  phone: string | null;
  email: string | null;
  status: MemberStatus;
  version: number;
}

const profileToState = (profile: PersonProfile) => ({
  fullName: profile.fullName.value,
  birthDate: profile.birthDate?.value ?? null,
  phone: profile.phone?.value ?? null,
  email: profile.email?.value ?? null,
});

// Situação de destino e situações de origem permitidas para cada ação.
const TRANSITIONS: Record<MemberStatusAction, { from: MemberStatus[]; to: MemberStatus }> = {
  activate: { from: ['INACTIVE'], to: 'ACTIVE' },
  deactivate: { from: ['ACTIVE'], to: 'INACTIVE' },
  // Arquivar retira o membro das listas do dia a dia, preservando todo o histórico.
  archive: { from: ['INACTIVE'], to: 'ARCHIVED' },
  restore: { from: ['ARCHIVED'], to: 'INACTIVE' },
};

// Pessoa membro da comunidade. Nasce ACTIVE; ARCHIVED é somente leitura até ser restaurado.
// Os vínculos com congregações são o Aggregate Membership, referenciado pelo ID do membro.
export class Member {
  private constructor(private state: MemberSnapshot) {}

  static register(id: string, profile: PersonProfile): Member {
    return new Member({ id, ...profileToState(profile), status: 'ACTIVE', version: 1 });
  }

  // Reconstitui um estado já validado e persistido.
  static restore(snapshot: MemberSnapshot): Member {
    return new Member({ ...snapshot });
  }

  get id(): string {
    return this.state.id;
  }

  get status(): MemberStatus {
    return this.state.status;
  }

  get version(): number {
    return this.state.version;
  }

  get isArchived(): boolean {
    return this.state.status === 'ARCHIVED';
  }

  updateProfile(profile: PersonProfile): Result<void, 'member_archived'> {
    if (this.isArchived) {
      return err('member_archived');
    }

    this.state = { ...this.state, ...profileToState(profile) };

    return ok();
  }

  changeStatus(action: MemberStatusAction): Result<void, MemberTransitionError> {
    const { from, to } = TRANSITIONS[action];

    if (!from.includes(this.state.status)) {
      return err('invalid_status_transition');
    }

    this.state = { ...this.state, status: to };

    return ok();
  }

  toSnapshot(): MemberSnapshot {
    return { ...this.state };
  }
}
