import { describe, expect, it } from 'vitest';
import {
  ACCOUNT_ID,
  DRAFT_CONGREGATION_ID,
  FixedClock,
  HEADQUARTERS_ID,
  InMemoryMemberQueries,
  InMemoryMemberRepository,
  InMemoryMembershipRepository,
  MEMBER_ID,
  memberSeed,
  memberView,
  membershipSnapshot,
  NORTH_ID,
  SequentialIdGenerator,
  StubCongregationCatalog,
  TODAY,
} from '../members.fixtures.js';
import {
  ChangeMemberStatusUseCase,
  EnrollMemberUseCase,
  GetMemberUseCase,
  ListMembersUseCase,
} from './member.use-cases.js';
import {
  ChangeMembershipStatusUseCase,
  ListMembershipsUseCase,
  RegisterMembershipUseCase,
} from './membership.use-cases.js';

const SECOND_ID = '01a14f8e-a000-7000-8000-000000000002';

const UNKNOWN_ID = '01a14f8e-ffff-7000-8000-000000000000';

const NEW_ACCOUNT_ID = '01a14f8e-e000-7000-8000-0000000000aa';

// Vínculo pendente do membro padrão na congregação informada.
const inCongregation = (congregationId: string) =>
  membershipSnapshot({
    congregationId,
    id: `01a14f8e-b000-7000-8000-${congregationId.slice(-12)}`,
  });

const setup = (
  members = [memberSeed()],
  memberships: ReturnType<typeof membershipSnapshot>[] = [],
) => {
  const membershipRepository = new InMemoryMembershipRepository(memberships);

  const memberRepository = new InMemoryMemberRepository(members);

  const queries = new InMemoryMemberQueries(memberRepository, membershipRepository);

  const catalog = new StubCongregationCatalog();

  const clock = new FixedClock();

  return {
    memberRepository,
    membershipRepository,
    queries,
    list: new ListMembersUseCase(queries),
    get: new GetMemberUseCase(queries),
    enroll: new EnrollMemberUseCase(memberRepository, queries, new SequentialIdGenerator(), clock),
    changeStatus: new ChangeMemberStatusUseCase(memberRepository, queries, membershipRepository),
    listMemberships: new ListMembershipsUseCase(memberRepository, membershipRepository, catalog),
    addMembership: new RegisterMembershipUseCase(
      memberRepository,
      membershipRepository,
      catalog,
      new SequentialIdGenerator(),
    ),
    changeMembership: new ChangeMembershipStatusUseCase(
      memberRepository,
      membershipRepository,
      catalog,
      clock,
    ),
  };
};

const enrollment = (accountId: string, fullName = 'Maria da Silva') => ({
  accountId,
  fullName,
  birthDate: null,
  phone: null,
  email: null,
});

describe('ListMembersUseCase', () => {
  it('deve paginar por cursor repassando os filtros, buscando pelo nome da Pessoa', async () => {
    const second = memberSeed({ id: SECOND_ID, fullName: 'João Souza' });

    const { list, queries } = setup([memberSeed(), second]);

    const first = await list.execute({
      status: null,
      congregationId: null,
      search: null,
      cursor: null,
      limit: 1,
    });

    expect(first).toEqual({ items: [memberView()], nextCursor: MEMBER_ID });

    expect(queries.lastQuery).toEqual({
      status: null,
      congregationId: null,
      search: null,
      after: null,
      limit: 2,
    });

    await expect(
      list.execute({ status: null, congregationId: null, search: 'joão', cursor: null, limit: 5 }),
    ).resolves.toEqual({ items: [memberView(second)], nextCursor: null });
  });

  it('deve filtrar por congregação com vínculo aberto', async () => {
    const { list } = setup(
      [memberSeed(), memberSeed({ id: SECOND_ID })],
      [membershipSnapshot({ memberId: SECOND_ID, congregationId: NORTH_ID, status: 'ACTIVE' })],
    );

    const page = await list.execute({
      status: 'ACTIVE',
      congregationId: NORTH_ID,
      search: null,
      cursor: null,
      limit: 20,
    });

    expect(page.items.map(({ id }) => id)).toEqual([SECOND_ID]);
  });
});

describe('GetMemberUseCase', () => {
  it('deve devolver o membro com os dados da Pessoa, ou not_found', async () => {
    const { get } = setup();

    await expect(get.execute(MEMBER_ID)).resolves.toEqual({ ok: true, value: memberView() });

    await expect(get.execute(UNKNOWN_ID)).resolves.toEqual({
      ok: false,
      error: { type: 'not_found' },
    });
  });
});

describe('EnrollMemberUseCase', () => {
  it('deve criar a Pessoa (dados normalizados) e o membro ACTIVE que a referencia', async () => {
    const { enroll, memberRepository } = setup([]);

    const result = await enroll.execute({
      accountId: NEW_ACCOUNT_ID,
      fullName: '  José   Pereira ',
      birthDate: null,
      phone: '(67) 99255-0858',
      email: ' Jose@Exemplo.COM ',
    });

    expect(result).toEqual({
      ok: true,
      value: {
        created: true,
        member: {
          id: '01a14f8e-c000-7000-8000-000000000002',
          status: 'ACTIVE',
          version: 1,
          person: {
            id: '01a14f8e-c000-7000-8000-000000000001',
            fullName: 'José Pereira',
            birthDate: null,
            phone: '67992550858',
            email: 'jose@exemplo.com',
          },
        },
      },
    });

    expect([...memberRepository.people.values()]).toEqual([
      expect.objectContaining({ accountId: NEW_ACCOUNT_ID, fullName: 'José Pereira' }),
    ]);

    expect([...memberRepository.stored.values()]).toEqual([
      expect.objectContaining({ personId: '01a14f8e-c000-7000-8000-000000000001' }),
    ]);
  });

  it('deve devolver o mesmo membro quando a conta já foi convertida', async () => {
    const { enroll, memberRepository } = setup();

    await expect(enroll.execute(enrollment(ACCOUNT_ID, 'Outro Nome'))).resolves.toEqual({
      ok: true,
      value: { created: false, member: memberView() },
    });

    expect(memberRepository.stored.size).toBe(1);
  });

  it('deve devolver o membro do pedido simultâneo que gravou primeiro', async () => {
    const { enroll, memberRepository } = setup([]);

    const winner = memberSeed({ id: SECOND_ID, accountId: NEW_ACCOUNT_ID });

    memberRepository.raceNextEnroll = winner;

    await expect(enroll.execute(enrollment(NEW_ACCOUNT_ID))).resolves.toEqual({
      ok: true,
      value: { created: false, member: memberView(winner) },
    });

    expect(memberRepository.stored.size).toBe(1);
  });

  it('deve listar os campos inválidos sem gravar nada', async () => {
    const { enroll, memberRepository } = setup([]);

    await expect(
      enroll.execute({
        accountId: NEW_ACCOUNT_ID,
        fullName: '1',
        birthDate: '2030-01-01',
        phone: '123',
        email: 'x',
      }),
    ).resolves.toEqual({
      ok: false,
      error: { type: 'invalid_fields', fields: ['fullName', 'birthDate', 'phone', 'email'] },
    });

    expect(memberRepository.people.size).toBe(0);
  });
});

describe('ChangeMemberStatusUseCase', () => {
  it('deve inativar, arquivar, restaurar e reativar', async () => {
    const { changeStatus } = setup();

    for (const [action, status] of [
      ['deactivate', 'INACTIVE'],
      ['archive', 'ARCHIVED'],
      ['restore', 'INACTIVE'],
      ['activate', 'ACTIVE'],
    ] as const) {
      await expect(changeStatus.execute({ id: MEMBER_ID, action })).resolves.toMatchObject({
        ok: true,
        value: { status, person: { fullName: 'Maria da Silva' } },
      });
    }
  });

  it('deve exigir o encerramento dos vínculos abertos antes de inativar', async () => {
    const { changeStatus } = setup([memberSeed()], [membershipSnapshot()]);

    await expect(changeStatus.execute({ id: MEMBER_ID, action: 'deactivate' })).resolves.toEqual({
      ok: false,
      error: { type: 'member_has_open_memberships' },
    });
  });

  it('deve recusar membro inexistente, transição inválida e conflito de versão', async () => {
    const { changeStatus, memberRepository } = setup();

    await expect(changeStatus.execute({ id: UNKNOWN_ID, action: 'activate' })).resolves.toEqual({
      ok: false,
      error: { type: 'not_found' },
    });

    await expect(changeStatus.execute({ id: MEMBER_ID, action: 'activate' })).resolves.toEqual({
      ok: false,
      error: { type: 'invalid_status_transition' },
    });

    memberRepository.failNextUpdate = true;

    await expect(changeStatus.execute({ id: MEMBER_ID, action: 'deactivate' })).resolves.toEqual({
      ok: false,
      error: { type: 'version_conflict' },
    });
  });
});

describe('Vínculos (Membership)', () => {
  it('deve registrar PENDING, ativar com data de início e listar com a congregação', async () => {
    const { addMembership, changeMembership, listMemberships } = setup();

    const added = await addMembership.execute({
      memberId: MEMBER_ID,
      congregationId: HEADQUARTERS_ID,
      primary: true,
    });

    expect(added).toMatchObject({
      ok: true,
      value: { status: 'PENDING', primary: true, congregation: { code: 'SEDE', name: 'Sede' } },
    });

    const id = added.ok ? added.value.id : '';

    await expect(changeMembership.execute({ id, action: 'activate' })).resolves.toMatchObject({
      ok: true,
      value: { status: 'ACTIVE', startedOn: TODAY, version: 2 },
    });

    await expect(listMemberships.execute(MEMBER_ID)).resolves.toMatchObject({
      ok: true,
      value: [{ id, status: 'ACTIVE', congregation: { code: 'SEDE' } }],
    });
  });

  it('deve recusar vínculo de membro inexistente ou inativo e de congregação inválida', async () => {
    const { addMembership } = setup([
      memberSeed(),
      memberSeed({ id: SECOND_ID, status: 'INACTIVE' }),
    ]);

    const add = (memberId: string, congregationId: string) =>
      addMembership.execute({ memberId, congregationId, primary: false });

    await expect(add(UNKNOWN_ID, HEADQUARTERS_ID)).resolves.toMatchObject({
      error: { type: 'not_found' },
    });

    await expect(add(SECOND_ID, HEADQUARTERS_ID)).resolves.toMatchObject({
      error: { type: 'member_inactive' },
    });

    await expect(add(MEMBER_ID, UNKNOWN_ID)).resolves.toMatchObject({
      error: { type: 'invalid_fields', fields: ['congregationId'] },
    });

    await expect(add(MEMBER_ID, DRAFT_CONGREGATION_ID)).resolves.toMatchObject({
      error: { type: 'congregation_inactive' },
    });
  });

  it('deve recusar segundo vínculo aberto na mesma congregação', async () => {
    const { addMembership } = setup([memberSeed()], [membershipSnapshot()]);

    await expect(
      addMembership.execute({
        memberId: MEMBER_ID,
        congregationId: HEADQUARTERS_ID,
        primary: false,
      }),
    ).resolves.toEqual({ ok: false, error: { type: 'duplicate_membership' } });
  });

  it('deve impedir dois vínculos principais ativos', async () => {
    const pending = membershipSnapshot({
      id: '01a14f8e-b000-7000-8000-000000000002',
      congregationId: NORTH_ID,
    });

    const { changeMembership } = setup(
      [memberSeed()],
      [membershipSnapshot({ status: 'ACTIVE', startedOn: '2020-01-01' }), pending],
    );

    await expect(changeMembership.execute({ id: pending.id, action: 'activate' })).resolves.toEqual(
      { ok: false, error: { type: 'primary_taken' } },
    );
  });

  it('deve exigir membro e congregação ativos somente para ativar', async () => {
    const { changeMembership } = setup(
      [memberSeed({ status: 'INACTIVE' })],
      [inCongregation(HEADQUARTERS_ID), inCongregation(DRAFT_CONGREGATION_ID)],
    );

    const [headquarters, draft] = [
      inCongregation(HEADQUARTERS_ID).id,
      inCongregation(DRAFT_CONGREGATION_ID).id,
    ];

    await expect(
      changeMembership.execute({ id: headquarters, action: 'activate' }),
    ).resolves.toMatchObject({ error: { type: 'member_inactive' } });

    // Encerrar continua permitido, mesmo com membro e congregação inativos.
    await expect(
      changeMembership.execute({ id: draft, action: 'deactivate' }),
    ).resolves.toMatchObject({ ok: true, value: { status: 'INACTIVE', endedOn: TODAY } });
  });

  it('deve recusar congregação inativa na ativação', async () => {
    const membership = membershipSnapshot({ congregationId: DRAFT_CONGREGATION_ID });

    const { changeMembership } = setup([memberSeed()], [membership]);

    await expect(
      changeMembership.execute({ id: membership.id, action: 'activate' }),
    ).resolves.toMatchObject({ error: { type: 'congregation_inactive' } });
  });

  it('deve recusar vínculo inexistente, transição inválida e conflito de versão', async () => {
    const closed = membershipSnapshot({ status: 'INACTIVE', endedOn: TODAY });

    const { changeMembership, membershipRepository } = setup([memberSeed()], [closed]);

    await expect(
      changeMembership.execute({ id: UNKNOWN_ID, action: 'deactivate' }),
    ).resolves.toMatchObject({ error: { type: 'not_found' } });

    await expect(
      changeMembership.execute({ id: closed.id, action: 'deactivate' }),
    ).resolves.toMatchObject({ error: { type: 'invalid_status_transition' } });

    membershipRepository.stored.set(closed.id, membershipSnapshot());

    membershipRepository.failNextUpdate = true;

    await expect(
      changeMembership.execute({ id: closed.id, action: 'deactivate' }),
    ).resolves.toMatchObject({ error: { type: 'version_conflict' } });
  });

  it('deve listar o histórico mesmo sem a congregação no catálogo', async () => {
    const orphan = membershipSnapshot({ congregationId: UNKNOWN_ID });

    const { listMemberships } = setup([memberSeed()], [orphan]);

    await expect(listMemberships.execute(MEMBER_ID)).resolves.toEqual({
      ok: true,
      value: [{ ...orphan, congregation: null }],
    });

    await expect(listMemberships.execute(UNKNOWN_ID)).resolves.toMatchObject({
      error: { type: 'not_found' },
    });
  });
});
