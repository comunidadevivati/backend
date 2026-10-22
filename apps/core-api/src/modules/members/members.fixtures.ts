// Dados e dublês compartilhados pelos testes unitários do contexto Members.
import {
  Clock,
  CongregationCatalog,
  IdGenerator,
  MemberQueries,
  MemberRepository,
  MembershipRepository,
  type CongregationRef,
  type MemberListQuery,
  type MemberView,
} from './application/ports.js';
import { Member, type MemberSnapshot } from './domain/member.js';
import { Membership, type MembershipSnapshot } from './domain/membership.js';
import { SocialLinks } from './domain/value-objects/social-links.js';
import type { Person, PersonSnapshot } from './domain/person.js';

export const TODAY = '2026-10-19';

export const MEMBER_ID = '01a14f8e-a000-7000-8000-000000000001';

const PERSON_ID = '01a14f8e-d000-7000-8000-000000000001';

export const ACCOUNT_ID = '01a14f8e-e000-7000-8000-000000000001';

export const HEADQUARTERS_ID = '01a14f8e-8ea5-7368-af3f-f594815a5aba';

export const NORTH_ID = '01a14f8e-8ea5-7368-af3f-000000000002';

export const DRAFT_CONGREGATION_ID = '01a14f8e-8ea5-7368-af3f-000000000003';

export const memberSnapshot = (overrides: Partial<MemberSnapshot> = {}): MemberSnapshot => ({
  id: MEMBER_ID,
  personId: PERSON_ID,
  status: 'ACTIVE',
  version: 1,
  ...overrides,
});

// Membro com a sua Pessoa, para semear os repositórios em memória.
export interface MemberSeed {
  id: string;
  personId: string;
  accountId: string;
  fullName: string;
  birthDate: string | null;
  phone: string | null;
  email: string | null;
  status: MemberSnapshot['status'];
  version: number;
}

// Sem personId/accountId explícitos, cada membro recebe uma Pessoa e uma conta próprias.
export const memberSeed = (overrides: Partial<MemberSeed> = {}): MemberSeed => ({
  id: MEMBER_ID,
  personId: overrides.id ? `01a14f8e-d000-7000-8000-${overrides.id.slice(-12)}` : PERSON_ID,
  accountId: overrides.id ? `01a14f8e-e000-7000-8000-${overrides.id.slice(-12)}` : ACCOUNT_ID,
  fullName: 'Maria da Silva',
  birthDate: '1990-05-20',
  phone: '67992550858',
  email: 'maria@exemplo.com',
  status: 'ACTIVE',
  version: 1,
  ...overrides,
});

// Membro como a API o expõe, a partir da semente.
export const memberView = (
  { birthDate, email, fullName, id, personId, phone, status, version }: MemberSeed = memberSeed(),
): MemberView => ({
  id,
  status,
  version,
  person: { id: personId, fullName, birthDate, phone, email },
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

  readonly people = new Map<string, PersonSnapshot>();

  // Simula outra escrita concluída entre a leitura e a gravação.
  failNextUpdate = false;

  // Simula outro pedido para a mesma conta gravado entre a consulta e a gravação.
  raceNextEnroll: MemberSeed | null = null;

  constructor(seeds: MemberSeed[] = [memberSeed()]) {
    super();

    for (const seed of seeds) {
      this.seed(seed);
    }
  }

  seed({
    accountId,
    birthDate,
    email,
    fullName,
    id,
    personId,
    phone,
    status,
    version,
  }: MemberSeed) {
    this.people.set(personId, {
      id: personId,
      accountId,
      fullName,
      sex: null,
      birthDate,
      phone,
      secondaryPhone: null,
      email,
      secondaryEmail: null,
      address: null,
      socialLinks: SocialLinks.empty().toProps(),
      avatarKey: null,
      version: 1,
    });

    this.stored.set(id, { id, personId, status, version });
  }

  findById(id: string): Promise<Member | null> {
    const snapshot = this.stored.get(id);

    return Promise.resolve(snapshot ? Member.restore(snapshot) : null);
  }

  enroll(person: Person, member: Member): Promise<'enrolled' | 'account_taken'> {
    if (this.raceNextEnroll) {
      this.seed(this.raceNextEnroll);

      this.raceNextEnroll = null;
    }

    const snapshot = person.toSnapshot();

    if ([...this.people.values()].some(({ accountId }) => accountId === snapshot.accountId)) {
      return Promise.resolve('account_taken');
    }

    this.people.set(snapshot.id, snapshot);

    this.stored.set(member.id, member.toSnapshot());

    return Promise.resolve('enrolled');
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

// Leitura em memória: junta o membro com a sua Pessoa, como o adaptador Drizzle.
export class InMemoryMemberQueries extends MemberQueries {
  lastQuery: MemberListQuery | null = null;

  constructor(
    private readonly members: InMemoryMemberRepository,
    private readonly memberships?: InMemoryMembershipRepository,
  ) {
    super();
  }

  findById(id: string): Promise<MemberView | null> {
    return Promise.resolve(this.views().find((view) => view.id === id) ?? null);
  }

  findByAccountId(accountId: string): Promise<MemberView | null> {
    const person = [...this.members.people.values()].find((item) => item.accountId === accountId);

    return Promise.resolve(this.views().find((view) => view.person.id === person?.id) ?? null);
  }

  list(query: MemberListQuery): Promise<MemberView[]> {
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
      this.views()
        .filter((member) => status === null || member.status === status)
        .filter(
          ({ person }) =>
            search === null || person.fullName.toLowerCase().includes(search.toLowerCase()),
        )
        .filter(({ id }) => congregationId === null || openIn(id))
        .filter(({ id }) => after === null || id > after)
        .toSorted((left, right) => left.id.localeCompare(right.id))
        .slice(0, limit),
    );
  }

  private views(): MemberView[] {
    return [...this.members.stored.values()].flatMap(({ id, personId, status, version }) => {
      const person = this.members.people.get(personId);

      return person
        ? [
            memberView({
              ...person,
              id,
              personId,
              status,
              version,
            }),
          ]
        : [];
    });
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
