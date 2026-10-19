import { err, ok, type Result } from '../../../shared/domain/result.js';
import {
  Member,
  type MemberSnapshot,
  type MemberStatus,
  type MemberStatusAction,
} from '../domain/member.js';
import {
  invalidFields,
  invalidStatusTransition,
  memberArchived,
  memberHasOpenMemberships,
  notFound,
  versionConflict,
  type MembersError,
} from './members-errors.js';
import {
  buildPersonProfile,
  mergeProfilePatch,
  type PersonProfileInput,
  type PersonProfilePatch,
} from './profile-input.js';
import type { Clock, IdGenerator, MemberRepository, MembershipRepository } from './ports.js';

export interface ListMembersQuery {
  status: MemberStatus | null;
  congregationId: string | null;
  search: string | null;
  cursor: string | null;
  limit: number;
}

export interface MemberPage {
  items: MemberSnapshot[];
  nextCursor: string | null;
}

export interface UpdateMemberCommand {
  id: string;
  expectedVersion: number;
  patch: PersonProfilePatch;
}

export interface ChangeMemberStatusCommand {
  id: string;
  action: MemberStatusAction;
}

type MemberResult = Result<MemberSnapshot, MembersError>;

const withVersion = (snapshot: MemberSnapshot, version: number): MemberSnapshot => ({
  ...snapshot,
  version,
});

export class ListMembersUseCase {
  constructor(private readonly members: MemberRepository) {}

  // Paginação por cursor: busca um item a mais para saber se existe a próxima página.
  async execute({ cursor, limit, ...filters }: ListMembersQuery): Promise<MemberPage> {
    const rows = await this.members.list({ ...filters, after: cursor, limit: limit + 1 });

    const items = rows.slice(0, limit);

    return {
      items,
      nextCursor: rows.length > limit ? (items.at(-1)?.id ?? null) : null,
    };
  }
}

export class GetMemberUseCase {
  constructor(private readonly members: MemberRepository) {}

  async execute(id: string): Promise<MemberResult> {
    const member = await this.members.findById(id);

    return member ? ok(member.toSnapshot()) : err(notFound);
  }
}

export class RegisterMemberUseCase {
  constructor(
    private readonly members: MemberRepository,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
  ) {}

  // O membro nasce ACTIVE; os vínculos com congregações são registrados à parte.
  async execute(input: PersonProfileInput): Promise<MemberResult> {
    const profile = buildPersonProfile(input, this.clock.today());

    if (!profile.ok) {
      return err(invalidFields(profile.error));
    }

    const member = Member.register(this.ids.next(), profile.value);

    await this.members.insert(member);

    return ok(member.toSnapshot());
  }
}

export class UpdateMemberUseCase {
  constructor(
    private readonly members: MemberRepository,
    private readonly clock: Clock,
  ) {}

  async execute({ expectedVersion, id, patch }: UpdateMemberCommand): Promise<MemberResult> {
    const member = await this.members.findById(id);

    if (!member) {
      return err(notFound);
    }

    if (member.version !== expectedVersion) {
      return err(versionConflict);
    }

    const { birthDate, email, fullName, phone } = member.toSnapshot();

    const profile = buildPersonProfile(
      mergeProfilePatch({ fullName, birthDate, phone, email }, patch),
      this.clock.today(),
    );

    if (!profile.ok) {
      return err(invalidFields(profile.error));
    }

    if (!member.updateProfile(profile.value).ok) {
      return err(memberArchived);
    }

    const version = await this.members.update(member);

    return version === null ? err(versionConflict) : ok(withVersion(member.toSnapshot(), version));
  }
}

export class ChangeMemberStatusUseCase {
  constructor(
    private readonly members: MemberRepository,
    private readonly memberships: MembershipRepository,
  ) {}

  async execute({ action, id }: ChangeMemberStatusCommand): Promise<MemberResult> {
    const member = await this.members.findById(id);

    if (!member) {
      return err(notFound);
    }

    // Inativar ou arquivar exige encerrar antes os vínculos ativos e pendentes, para não haver
    // vínculo aberto de quem não participa mais da comunidade.
    if (
      (action === 'deactivate' || action === 'archive') &&
      (await this.memberships.hasOpenMemberships(id))
    ) {
      return err(memberHasOpenMemberships);
    }

    if (!member.changeStatus(action).ok) {
      return err(invalidStatusTransition);
    }

    const version = await this.members.update(member);

    return version === null ? err(versionConflict) : ok(withVersion(member.toSnapshot(), version));
  }
}
