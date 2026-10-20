import { err, ok, type Result } from '../../../shared/domain/result.js';

export type MemberStatus = 'ACTIVE' | 'INACTIVE' | 'ARCHIVED';

export type MemberStatusAction = 'activate' | 'deactivate' | 'archive' | 'restore';

export type MemberTransitionError = 'invalid_status_transition';

// O membro não guarda dados pessoais: eles pertencem à Pessoa, referenciada pelo ID.
export interface MemberSnapshot {
  id: string;
  personId: string;
  status: MemberStatus;
  version: number;
}

// Situação de destino e situações de origem permitidas para cada ação.
const TRANSITIONS: Record<MemberStatusAction, { from: MemberStatus[]; to: MemberStatus }> = {
  activate: { from: ['INACTIVE'], to: 'ACTIVE' },
  deactivate: { from: ['ACTIVE'], to: 'INACTIVE' },
  // Arquivar retira o membro das listas do dia a dia, preservando todo o histórico.
  archive: { from: ['INACTIVE'], to: 'ARCHIVED' },
  restore: { from: ['ARCHIVED'], to: 'INACTIVE' },
};

// Participação de uma Pessoa na comunidade. Nasce ACTIVE; uma Pessoa tem no máximo um membro.
// Os vínculos com congregações são o Aggregate Membership, referenciado pelo ID do membro.
export class Member {
  private constructor(private state: MemberSnapshot) {}

  static enroll(id: string, personId: string): Member {
    return new Member({ id, personId, status: 'ACTIVE', version: 1 });
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
