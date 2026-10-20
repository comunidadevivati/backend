import { err, ok, type Result } from '../../../shared/domain/result.js';
import type { MemberTransitionError } from './member.js';

export type MembershipStatus = 'PENDING' | 'ACTIVE' | 'INACTIVE';

export type MembershipStatusAction = 'activate' | 'deactivate';

export interface MembershipSnapshot {
  id: string;
  memberId: string;
  // Congregação do contexto Organization, referenciada somente pelo ID estável.
  congregationId: string;
  // Vínculo congregacional principal: no máximo um ativo por membro.
  primary: boolean;
  status: MembershipStatus;
  // Datas ISO (AAAA-MM-DD) de início (ativação) e de encerramento.
  startedOn: string | null;
  endedOn: string | null;
  version: number;
}

export interface RegisterMembership {
  id: string;
  memberId: string;
  congregationId: string;
  primary: boolean;
}

// Vínculo de um membro com uma congregação. Nasce PENDING, é ativado (PENDING → ACTIVE) e encerrado
// (PENDING | ACTIVE → INACTIVE). Um vínculo encerrado é histórico: nunca é reaberto nem apagado; um
// novo vínculo é registrado quando o membro volta à congregação.
export class Membership {
  private constructor(private state: MembershipSnapshot) {}

  static register({ congregationId, id, memberId, primary }: RegisterMembership): Membership {
    return new Membership({
      id,
      memberId,
      congregationId,
      primary,
      status: 'PENDING',
      startedOn: null,
      endedOn: null,
      version: 1,
    });
  }

  static restore(snapshot: MembershipSnapshot): Membership {
    return new Membership({ ...snapshot });
  }

  get memberId(): string {
    return this.state.memberId;
  }

  get congregationId(): string {
    return this.state.congregationId;
  }

  get status(): MembershipStatus {
    return this.state.status;
  }

  activate(today: string): Result<void, MemberTransitionError> {
    if (this.state.status !== 'PENDING') {
      return err('invalid_status_transition');
    }

    this.state = { ...this.state, status: 'ACTIVE', startedOn: today };

    return ok();
  }

  // Encerra o vínculo; um vínculo pendente encerrado fica sem data de início (cancelado).
  deactivate(today: string): Result<void, MemberTransitionError> {
    if (this.state.status === 'INACTIVE') {
      return err('invalid_status_transition');
    }

    this.state = { ...this.state, status: 'INACTIVE', endedOn: today };

    return ok();
  }

  toSnapshot(): MembershipSnapshot {
    return { ...this.state };
  }
}
