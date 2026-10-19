// Dados e dublês compartilhados pelos testes unitários do contexto Members.
import {
  Clock,
  CongregationCatalog,
  IdGenerator,
  MemberRepository,
  MembershipRepository,
  type CongregationRef,
  type MemberListQuery,
} from './application/ports.js';
import { Member, type MemberSnapshot } from './domain/member.js';
import { Membership, type MembershipSnapshot } from './domain/membership.js';

export const TODAY = '2026-10-19';

export const MEMBER_ID = '01a14f8e-a000-7000-8000-000000000001';

export const HEADQUARTERS_ID = '01a14f8e-8ea5-7368-af3f-f594815a5aba';

export const NORTH_ID = '01a14f8e-8ea5-7368-af3f-000000000002';

export const DRAFT_CONGREGATION_ID = '01a14f8e-8ea5-7368-af3f-000000000003';

export const memberSnapshot = (overrides: Partial<MemberSnapshot> = {}): MemberSnapshot => ({
  id: MEMBER_ID,
  fullName: 'Maria da Silva',
  birthDate: '1990-05-20',
  phone: '67992550858',
  email: 'maria@exemplo.com',
  status: 'ACTIVE',
  version: 1,
  ...overrides,
});

export const membershipSnapshot = (
  overrides: Partial<MembershipSnapshot> = {},
): MembershipSnapshot => ({
  id: '01a14f8e-b000-7000-8000-000000000001',
  memberId: MEMBER_ID,
  congregationId: HEADQUARTERS_ID,
  primary: true,
  status: 'PENDING',
  startedOn: null,
  endedOn: null,
  version: 1,
  ...overrides,
});

const isOpen = ({ status }: MembershipSnapshot) => status === 'PENDING' || status === 'ACTIVE';

// Repositórios em memória com as mesmas regras de versão e de unicidade dos adaptadores Drizzle.
export class InMemoryMemberRepository extends MemberRepository {
  readonly stored = new Map<string, MemberSnapshot>();

  lastQuery: MemberListQuery | null = null;

  // Simula outra escrita concluída entre a leitura e a gravação.
  failNextUpdate = false;

  constructor(
    snapshots: MemberSnapshot[] = [memberSnapshot()],
    private readonly memberships?: InMemoryMembershipRepository,
  ) {
    super();

    for (const snapshot of snapshots) {
      this.stored.set(snapshot.id, snapshot);
    }
  }

  findById(id: string): Promise<Member | null> {
    const snapshot = this.stored.get(id);

    return Promise.resolve(snapshot ? Member.restore(snapshot) : null);
  }

  list(query: MemberListQuery): Promise<MemberSnapshot[]> {
    this.lastQuery = query;

    const { after, congregationId, limit, search, status } = query;

    const openIn = (memberId: string) =>
      [...(this.memberships?.stored.values() ?? [])].some(
        (membership) =>
          membership.memberId === memberId &&
          membership.congregationId === congregationId &&
          isOpen(membership),
      );

    return Promise.resolve(
      [...this.stored.values()]
        .filter((member) => status === null || member.status === status)
        .filter(
          ({ fullName }) =>
            search === null || fullName.toLowerCase().includes(search.toLowerCase()),
        )
        .filter(({ id }) => congregationId === null || openIn(id))
        .filter(({ id }) => after === null || id > after)
        .toSorted((left, right) => left.id.localeCompare(right.id))
        .slice(0, limit),
    );
  }

  insert(member: Member): Promise<void> {
    this.stored.set(member.id, member.toSnapshot());

    return Promise.resolve();
  }

  update(member: Member): Promise<number | null> {
    const current = this.stored.get(member.id);

    if (this.failNextUpdate || member.version !== current?.version) {
      this.failNextUpdate = false;

      return Promise.resolve(null);
    }

    const version = member.version + 1;

    this.stored.set(member.id, { ...member.toSnapshot(), version });

    return Promise.resolve(version);
  }
}

export class InMemoryMembershipRepository extends MembershipRepository {
  readonly stored = new Map<string, MembershipSnapshot>();

  failNextUpdate = false;

  constructor(snapshots: MembershipSnapshot[] = []) {
    super();

    for (const snapshot of snapshots) {
      this.stored.set(snapshot.id, snapshot);
    }
  }

  findById(id: string): Promise<Membership | null> {
    const snapshot = this.stored.get(id);

    return Promise.resolve(snapshot ? Membership.restore(snapshot) : null);
  }

  listByMember(memberId: string): Promise<MembershipSnapshot[]> {
    return Promise.resolve(
      [...this.stored.values()]
        .filter((membership) => membership.memberId === memberId)
        .toSorted((left, right) => left.id.localeCompare(right.id)),
    );
  }

  hasOpenMemberships(memberId: string): Promise<boolean> {
    return Promise.resolve(
      [...this.stored.values()].some(
        (membership) => membership.memberId === memberId && isOpen(membership),
      ),
    );
  }

  insert(membership: Membership): Promise<'inserted' | 'duplicate'> {
    const snapshot = membership.toSnapshot();

    const duplicate = [...this.stored.values()].some(
      (other) =>
        other.memberId === snapshot.memberId &&
        other.congregationId === snapshot.congregationId &&
        isOpen(other),
    );

    if (duplicate) {
      return Promise.resolve('duplicate');
    }

    this.stored.set(snapshot.id, snapshot);

    return Promise.resolve('inserted');
  }

  update(membership: Membership): Promise<number | null | 'primary_taken'> {
    const snapshot = membership.toSnapshot();

    const current = this.stored.get(snapshot.id);

    if (this.failNextUpdate || snapshot.version !== current?.version) {
      this.failNextUpdate = false;

      return Promise.resolve(null);
    }

    const primaryTaken =
      snapshot.primary &&
      snapshot.status === 'ACTIVE' &&
      [...this.stored.values()].some(
        (other) =>
          other.id !== snapshot.id &&
          other.memberId === snapshot.memberId &&
          other.primary &&
          other.status === 'ACTIVE',
      );

    if (primaryTaken) {
      return Promise.resolve('primary_taken');
    }

    const version = snapshot.version + 1;

    this.stored.set(snapshot.id, { ...snapshot, version });

    return Promise.resolve(version);
  }
}

const congregationRefs: CongregationRef[] = [
  { id: HEADQUARTERS_ID, code: 'SEDE', name: 'Sede', active: true },
  { id: NORTH_ID, code: 'CG-NORTE', name: 'Congregação Norte', active: true },
  { id: DRAFT_CONGREGATION_ID, code: 'CG-SUL', name: 'Congregação Sul', active: false },
];

export class StubCongregationCatalog extends CongregationCatalog {
  constructor(private readonly refs: CongregationRef[] = congregationRefs) {
    super();
  }

  findById(id: string): Promise<CongregationRef | null> {
    return Promise.resolve(this.refs.find((ref) => ref.id === id) ?? null);
  }

  findByIds(ids: readonly string[]): Promise<CongregationRef[]> {
    return Promise.resolve(this.refs.filter((ref) => ids.includes(ref.id)));
  }
}

export class SequentialIdGenerator extends IdGenerator {
  private counter = 0;

  next(): string {
    this.counter += 1;

    return `01a14f8e-c000-7000-8000-${String(this.counter).padStart(12, '0')}`;
  }
}

export class FixedClock extends Clock {
  constructor(private readonly date: string = TODAY) {
    super();
  }

  today(): string {
    return this.date;
  }
}
