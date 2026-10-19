// Dados e dublês compartilhados pelos testes unitários do contexto Organization.
import {
  buildCongregationDetails,
  buildOrganizationDetails,
  type CongregationDetailsInput,
  type OrganizationDetailsInput,
} from './application/details-input.js';
import {
  CongregationRepository,
  IdGenerator,
  OrganizationRepository,
  type CongregationListQuery,
} from './application/ports.js';
import { Congregation, type CongregationSnapshot } from './domain/congregation.js';
import { Organization, type OrganizationSnapshot } from './domain/organization.js';

const ORGANIZATION_ID = '01a14f8e-8ea4-7f34-ad19-0e85d0e1237c';

export const HEADQUARTERS_ID = '01a14f8e-8ea5-7368-af3f-f594815a5aba';

export const address = {
  street: 'Av. Roseira',
  number: '1684',
  complement: null,
  district: 'Parque Residencial dos Girassóis',
  city: 'Campo Grande',
  state: 'MS',
  postalCode: '79091848',
};

export const organizationSnapshot = (
  overrides: Partial<OrganizationSnapshot> = {},
): OrganizationSnapshot => ({
  id: ORGANIZATION_ID,
  legalName: 'IGREJA EVANGELICA VIVA E EFICAZ',
  tradeName: 'IGREJA EVANGELICA VIVA E EFICAZ',
  cnpj: '14158325000101',
  address,
  phone: '67992550858',
  email: 'comvivati@gmail.com',
  status: 'ACTIVE',
  version: 1,
  ...overrides,
});

export const congregationSnapshot = (
  overrides: Partial<CongregationSnapshot> = {},
): CongregationSnapshot => ({
  id: HEADQUARTERS_ID,
  organizationId: ORGANIZATION_ID,
  code: 'SEDE',
  name: 'IGREJA EVANGELICA VIVA E EFICAZ',
  cnpj: '14158325000101',
  address,
  phone: '67992550858',
  email: 'comvivati@gmail.com',
  headquarters: true,
  status: 'ACTIVE',
  version: 1,
  ...overrides,
});

const unwrap = <T>(result: { ok: true; value: T } | { ok: false; error: string[] }): T => {
  if (!result.ok) {
    throw new Error(`Dados de teste inválidos: ${result.error.join(', ')}`);
  }

  return result.value;
};

// Value Objects já validados, para os testes de Domain não dependerem da Application.
export const organizationDetails = (input: OrganizationDetailsInput) =>
  unwrap(buildOrganizationDetails(input));

export const congregationDetails = (input: CongregationDetailsInput) =>
  unwrap(buildCongregationDetails(input));

// Repositórios em memória com o mesmo controle otimista de versão dos adaptadores Drizzle.
export class InMemoryOrganizationRepository extends OrganizationRepository {
  stored: OrganizationSnapshot | null;

  // Simula outra escrita concluída entre a leitura e a gravação.
  failNextUpdate = false;

  constructor(snapshot: OrganizationSnapshot | null = organizationSnapshot()) {
    super();

    this.stored = snapshot;
  }

  findMain(): Promise<Organization | null> {
    return Promise.resolve(this.stored ? Organization.restore(this.stored) : null);
  }

  update(organization: Organization): Promise<number | null> {
    if (this.failNextUpdate || organization.version !== this.stored?.version) {
      this.failNextUpdate = false;

      return Promise.resolve(null);
    }

    this.stored = { ...organization.toSnapshot(), version: organization.version + 1 };

    return Promise.resolve(this.stored.version);
  }
}

export class InMemoryCongregationRepository extends CongregationRepository {
  readonly stored = new Map<string, CongregationSnapshot>();

  failNextUpdate = false;

  lastQuery: CongregationListQuery | null = null;

  constructor(snapshots: CongregationSnapshot[] = [congregationSnapshot()]) {
    super();

    for (const snapshot of snapshots) {
      this.stored.set(snapshot.id, snapshot);
    }
  }

  findById(id: string): Promise<Congregation | null> {
    const snapshot = this.stored.get(id);

    return Promise.resolve(snapshot ? Congregation.restore(snapshot) : null);
  }

  list(query: CongregationListQuery): Promise<CongregationSnapshot[]> {
    this.lastQuery = query;

    const after = query.after;

    return Promise.resolve(
      [...this.stored.values()]
        .filter(({ status }) => query.status === null || status === query.status)
        .filter(({ id }) => after === null || id > after)
        .toSorted((left, right) => left.id.localeCompare(right.id))
        .slice(0, query.limit),
    );
  }

  insert(congregation: Congregation): Promise<'inserted' | 'code_taken'> {
    const snapshot = congregation.toSnapshot();

    if ([...this.stored.values()].some(({ code }) => code === snapshot.code)) {
      return Promise.resolve('code_taken');
    }

    this.stored.set(snapshot.id, snapshot);

    return Promise.resolve('inserted');
  }

  update(congregation: Congregation): Promise<number | null> {
    const current = this.stored.get(congregation.id);

    if (this.failNextUpdate || congregation.version !== current?.version) {
      this.failNextUpdate = false;

      return Promise.resolve(null);
    }

    const version = congregation.version + 1;

    this.stored.set(congregation.id, { ...congregation.toSnapshot(), version });

    return Promise.resolve(version);
  }
}

export class SequentialIdGenerator extends IdGenerator {
  private counter = 0;

  next(): string {
    this.counter += 1;

    return `01a14f8e-9000-7000-8000-${String(this.counter).padStart(12, '0')}`;
  }
}
