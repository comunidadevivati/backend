import { err, ok, type Result } from '../../../shared/domain/result.js';
import {
  Membership,
  type MembershipSnapshot,
  type MembershipStatusAction,
} from '../domain/membership.js';
import {
  congregationInactive,
  duplicateMembership,
  invalidFields,
  invalidStatusTransition,
  memberInactive,
  notFound,
  primaryTaken,
  versionConflict,
  type MembersError,
} from './members-errors.js';
import type {
  Clock,
  CongregationCatalog,
  CongregationRef,
  IdGenerator,
  MemberRepository,
  MembershipRepository,
} from './ports.js';

// Vínculo como exposto pela API: inclui código e nome da congregação para exibição.
export interface MembershipView extends MembershipSnapshot {
  congregation: { code: string; name: string } | null;
}

export interface RegisterMembershipCommand {
  memberId: string;
  congregationId: string;
  primary: boolean;
}

export interface ChangeMembershipStatusCommand {
  id: string;
  action: MembershipStatusAction;
}

type MembershipResult = Result<MembershipView, MembersError>;

const toView = (
  snapshot: MembershipSnapshot,
  congregation: CongregationRef | null | undefined,
): MembershipView => ({
  ...snapshot,
  congregation: congregation ? { code: congregation.code, name: congregation.name } : null,
});

export class ListMembershipsUseCase {
  constructor(
    private readonly members: MemberRepository,
    private readonly memberships: MembershipRepository,
    private readonly congregations: CongregationCatalog,
  ) {}

  // Histórico completo do membro, inclusive vínculos encerrados.
  async execute(memberId: string): Promise<Result<MembershipView[], MembersError>> {
    if (!(await this.members.findById(memberId))) {
      return err(notFound);
    }

    const snapshots = await this.memberships.listByMember(memberId);

    const congregations = await this.congregations.findByIds([
      ...new Set(snapshots.map(({ congregationId }) => congregationId)),
    ]);

    const byId = new Map(congregations.map((congregation) => [congregation.id, congregation]));

    return ok(snapshots.map((snapshot) => toView(snapshot, byId.get(snapshot.congregationId))));
  }
}

export class RegisterMembershipUseCase {
  constructor(
    private readonly members: MemberRepository,
    private readonly memberships: MembershipRepository,
    private readonly congregations: CongregationCatalog,
    private readonly ids: IdGenerator,
  ) {}

  // O vínculo nasce PENDING; a ativação confirma o início na congregação.
  async execute({
    congregationId,
    memberId,
    primary,
  }: RegisterMembershipCommand): Promise<MembershipResult> {
    const member = await this.members.findById(memberId);

    if (!member) {
      return err(notFound);
    }

    if (member.status !== 'ACTIVE') {
      return err(memberInactive);
    }

    const congregation = await this.congregations.findById(congregationId);

    if (!congregation) {
      return err(invalidFields(['congregationId']));
    }

    if (!congregation.active) {
      return err(congregationInactive);
    }

    const membership = Membership.register({
      id: this.ids.next(),
      memberId,
      congregationId,
      primary,
    });

    const inserted = await this.memberships.insert(membership);

    return inserted === 'duplicate'
      ? err(duplicateMembership)
      : ok(toView(membership.toSnapshot(), congregation));
  }
}

export class ChangeMembershipStatusUseCase {
  constructor(
    private readonly members: MemberRepository,
    private readonly memberships: MembershipRepository,
    private readonly congregations: CongregationCatalog,
    private readonly clock: Clock,
  ) {}

  async execute({ action, id }: ChangeMembershipStatusCommand): Promise<MembershipResult> {
    const membership = await this.memberships.findById(id);

    if (!membership) {
      return err(notFound);
    }

    const congregation = await this.congregations.findById(membership.congregationId);

    // Encerrar é sempre permitido; ativar exige membro e congregação ativos.
    if (action === 'activate') {
      const member = await this.members.findById(membership.memberId);

      if (member?.status !== 'ACTIVE') {
        return err(memberInactive);
      }

      if (!congregation?.active) {
        return err(congregationInactive);
      }
    }

    const today = this.clock.today();

    const transition =
      action === 'activate' ? membership.activate(today) : membership.deactivate(today);

    if (!transition.ok) {
      return err(invalidStatusTransition);
    }

    const version = await this.memberships.update(membership);

    if (version === 'primary_taken') {
      return err(primaryTaken);
    }

    return version === null
      ? err(versionConflict)
      : ok(toView({ ...membership.toSnapshot(), version }, congregation));
  }
}
