import { err, ok, type Result } from '../../../shared/domain/result.js';
import { Member, type MemberStatus, type MemberStatusAction } from '../domain/member.js';
import { Person } from '../domain/person.js';
import {
  invalidFields,
  invalidStatusTransition,
  memberHasOpenMemberships,
  notFound,
  versionConflict,
  type MembersError,
} from './members-errors.js';
import { buildPersonProfile, type PersonProfileInput } from './profile-input.js';
import type {
  Clock,
  IdGenerator,
  MemberQueries,
  MemberRepository,
  MemberView,
  MembershipRepository,
} from './ports.js';

export interface ListMembersQuery {
  status: MemberStatus | null;
  congregationId: string | null;
  search: string | null;
  cursor: string | null;
  limit: number;
}

export interface MemberPage {
  items: MemberView[];
  nextCursor: string | null;
}

// Dados da conta verificada que origina a Pessoa e o membro.
export interface EnrollMemberCommand extends PersonProfileInput {
  accountId: string;
}

export interface EnrolledMember {
  member: MemberView;
  // false quando a conta já tinha Pessoa e membro (repetição do pedido).
  created: boolean;
}

export interface ChangeMemberStatusCommand {
  id: string;
  action: MemberStatusAction;
}

type MemberResult = Result<MemberView, MembersError>;

export class ListMembersUseCase {
  constructor(private readonly queries: MemberQueries) {}

  // Paginação por cursor: busca um item a mais para saber se existe a próxima página.
  async execute({ cursor, limit, ...filters }: ListMembersQuery): Promise<MemberPage> {
    const rows = await this.queries.list({ ...filters, after: cursor, limit: limit + 1 });

    const items = rows.slice(0, limit);

    return {
      items,
      nextCursor: rows.length > limit ? (items.at(-1)?.id ?? null) : null,
    };
  }
}

export class GetMemberUseCase {
  constructor(private readonly queries: MemberQueries) {}

  async execute(id: string): Promise<MemberResult> {
    const member = await this.queries.findById(id);

    return member ? ok(member) : err(notFound);
  }
}

// Um membro nunca é cadastrado do zero: a conta verificada vira Pessoa (com os dados da conta) e a
// Pessoa vira membro, na mesma transação. Idempotente por conta: repetir o pedido devolve o mesmo
// membro, inclusive quando a primeira resposta se perdeu.
export class EnrollMemberUseCase {
  constructor(
    private readonly members: MemberRepository,
    private readonly queries: MemberQueries,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
  ) {}

  async execute({
    accountId,
    ...input
  }: EnrollMemberCommand): Promise<Result<EnrolledMember, MembersError>> {
    const existing = await this.queries.findByAccountId(accountId);

    if (existing) {
      return ok({ member: existing, created: false });
    }

    const profile = buildPersonProfile(input, this.clock.today());

    if (!profile.ok) {
      return err(invalidFields(profile.error));
    }

    const person = Person.register(this.ids.next(), accountId, profile.value);

    const member = Member.enroll(this.ids.next(), person.id);

    // Outro pedido para a mesma conta gravou primeiro: devolve o membro dele.
    if ((await this.members.enroll(person, member)) === 'account_taken') {
      const winner = await this.queries.findByAccountId(accountId);

      return winner ? ok({ member: winner, created: false }) : err(versionConflict);
    }

    const created = await this.queries.findById(member.id);

    return created ? ok({ member: created, created: true }) : err(notFound);
  }
}

export class ChangeMemberStatusUseCase {
  constructor(
    private readonly members: MemberRepository,
    private readonly queries: MemberQueries,
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

    if ((await this.members.update(member)) === null) {
      return err(versionConflict);
    }

    const view = await this.queries.findById(id);

    return view ? ok(view) : err(notFound);
  }
}
