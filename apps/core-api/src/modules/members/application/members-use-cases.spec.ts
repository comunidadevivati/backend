import { describe, expect, it } from 'vitest';
import {
  DRAFT_CONGREGATION_ID,
  FixedClock,
  HEADQUARTERS_ID,
  InMemoryMemberRepository,
  InMemoryMembershipRepository,
  MEMBER_ID,
  memberSnapshot,
  membershipSnapshot,
  NORTH_ID,
  SequentialIdGenerator,
  StubCongregationCatalog,
  TODAY,
} from '../members.fixtures.js';
import {
  ChangeMemberStatusUseCase,
  GetMemberUseCase,
  ListMembersUseCase,
  RegisterMemberUseCase,
  UpdateMemberUseCase,
} from './member.use-cases.js';
import {
  ChangeMembershipStatusUseCase,
  ListMembershipsUseCase,
  RegisterMembershipUseCase,
} from './membership.use-cases.js';

const SECOND_ID = '01a14f8e-a000-7000-8000-000000000002';

const UNKNOWN_ID = '01a14f8e-ffff-7000-8000-000000000000';

// Vínculo pendente do membro padrão na congregação informada.
const inCongregation = (congregationId: string) =>
  membershipSnapshot({
    congregationId,
    id: `01a14f8e-b000-7000-8000-${congregationId.slice(-12)}`,
  });

const setup = (
  members = [memberSnapshot()],
  memberships: ReturnType<typeof membershipSnapshot>[] = [],
) => {
  const membershipRepository = new InMemoryMembershipRepository(memberships);

  const memberRepository = new InMemoryMemberRepository(members, membershipRepository);

  const catalog = new StubCongregationCatalog();

  const clock = new FixedClock();

  return {
    memberRepository,
    membershipRepository,
    list: new ListMembersUseCase(memberRepository),
    get: new GetMemberUseCase(memberRepository),
    register: new RegisterMemberUseCase(memberRepository, new SequentialIdGenerator(), clock),
    update: new UpdateMemberUseCase(memberRepository, clock),
    changeStatus: new ChangeMemberStatusUseCase(memberRepository, membershipRepository),
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

describe('ListMembersUseCase', () => {
  it('deve paginar por cursor repassando os filtros', async () => {
    const second = memberSnapshot({ id: SECOND_ID, fullName: 'João Souza' });

    const { list, memberRepository } = setup([memberSnapshot(), second]);

    const first = await list.execute({
      status: null,
      congregationId: null,
      search: null,
      cursor: null,
      limit: 1,
    });

    expect(first).toEqual({ items: [memberSnapshot()], nextCursor: MEMBER_ID });

    expect(memberRepository.lastQuery).toEqual({
      status: null,
      congregationId: null,
      search: null,
      after: null,
      limit: 2,
    });

    await expect(
      list.execute({ status: null, congregationId: null, search: 'joão', cursor: null, limit: 5 }),
    ).resolves.toEqual({ items: [second], nextCursor: null });
  });

  it('deve filtrar por congregação com vínculo aberto', async () => {
    const { list } = setup(
      [memberSnapshot(), memberSnapshot({ id: SECOND_ID })],
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
  it('deve devolver o membro ou not_found', async () => {
    const { get } = setup();

    await expect(get.execute(MEMBER_ID)).resolves.toEqual({ ok: true, value: memberSnapshot() });

    await expect(get.execute(UNKNOWN_ID)).resolves.toEqual({
      ok: false,
      error: { type: 'not_found' },
    });
  });
});

describe('RegisterMemberUseCase', () => {
  it('deve registrar o membro ACTIVE com dados normalizados', async () => {
    const { memberRepository, register } = setup([]);

    const result = await register.execute({
      fullName: '  José   Pereira ',
      birthDate: '1985-01-31',
      phone: '(67) 99255-0858',
      email: ' Jose@Exemplo.COM ',
    });

    expect(result).toEqual({
      ok: true,
      value: {
        id: '01a14f8e-c000-7000-8000-000000000001',
        fullName: 'José Pereira',
        birthDate: '1985-01-31',
        phone: '67992550858',
        email: 'jose@exemplo.com',
        status: 'ACTIVE',
        version: 1,
      },
    });

    expect(memberRepository.stored.size).toBe(1);
  });

  it('deve tratar opcionais vazios como ausentes e listar os campos inválidos', async () => {
    const { register } = setup([]);

    await expect(
      register.execute({ fullName: 'Ana Lima', birthDate: ' ', phone: '', email: null }),
    ).resolves.toMatchObject({ ok: true, value: { birthDate: null, phone: null, email: null } });

    await expect(
      register.execute({ fullName: '1', birthDate: '2030-01-01', phone: '123', email: 'x' }),
    ).resolves.toEqual({
      ok: false,
      error: { type: 'invalid_fields', fields: ['fullName', 'birthDate', 'phone', 'email'] },
    });
  });
});

describe('UpdateMemberUseCase', () => {
  it('deve aplicar alteração parcial com controle otimista', async () => {
    const { update } = setup();

    await expect(
      update.execute({ id: MEMBER_ID, expectedVersion: 1, patch: { phone: null } }),
    ).resolves.toEqual({
      ok: true,
      value: memberSnapshot({ phone: null, version: 2 }),
    });

    await expect(
      update.execute({ id: MEMBER_ID, expectedVersion: 1, patch: { fullName: 'Outra' } }),
    ).resolves.toEqual({ ok: false, error: { type: 'version_conflict' } });
  });

  it.each([
    ['inexistente', setup(), UNKNOWN_ID, {}, { type: 'not_found' }],
    [
      'com dados inválidos',
      setup(),
      MEMBER_ID,
      { email: 'invalido' },
      { type: 'invalid_fields', fields: ['email'] },
    ],
    [
      'arquivado',
      setup([memberSnapshot({ status: 'ARCHIVED' })]),
      MEMBER_ID,
      { fullName: 'Outra Pessoa' },
      { type: 'member_archived' },
    ],
  ])('deve recusar membro %s', async (_caso, { update }, id, patch, error) => {
    await expect(update.execute({ id, expectedVersion: 1, patch })).resolves.toEqual({
      ok: false,
      error,
    });
  });

  it('deve informar conflito quando outra escrita vence entre leitura e gravação', async () => {
    const { memberRepository, update } = setup();

    memberRepository.failNextUpdate = true;

    await expect(
      update.execute({ id: MEMBER_ID, expectedVersion: 1, patch: { fullName: 'Outra' } }),
    ).resolves.toEqual({ ok: false, error: { type: 'version_conflict' } });
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
        value: { status },
      });
    }
  });

  it('deve exigir o encerramento dos vínculos abertos antes de inativar', async () => {
    const { changeStatus } = setup([memberSnapshot()], [membershipSnapshot()]);

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
      memberSnapshot(),
      memberSnapshot({ id: SECOND_ID, status: 'INACTIVE' }),
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
    const { addMembership } = setup([memberSnapshot()], [membershipSnapshot()]);

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
      [memberSnapshot()],
      [membershipSnapshot({ status: 'ACTIVE', startedOn: '2020-01-01' }), pending],
    );

    await expect(changeMembership.execute({ id: pending.id, action: 'activate' })).resolves.toEqual(
      { ok: false, error: { type: 'primary_taken' } },
    );
  });

  it('deve exigir membro e congregação ativos somente para ativar', async () => {
    const { changeMembership } = setup(
      [memberSnapshot({ status: 'INACTIVE' })],
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

    const { changeMembership } = setup([memberSnapshot()], [membership]);

    await expect(
      changeMembership.execute({ id: membership.id, action: 'activate' }),
    ).resolves.toMatchObject({ error: { type: 'congregation_inactive' } });
  });

  it('deve recusar vínculo inexistente, transição inválida e conflito de versão', async () => {
    const closed = membershipSnapshot({ status: 'INACTIVE', endedOn: TODAY });

    const { changeMembership, membershipRepository } = setup([memberSnapshot()], [closed]);

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

    const { listMemberships } = setup([memberSnapshot()], [orphan]);

    await expect(listMemberships.execute(MEMBER_ID)).resolves.toEqual({
      ok: true,
      value: [{ ...orphan, congregation: null }],
    });

    await expect(listMemberships.execute(UNKNOWN_ID)).resolves.toMatchObject({
      error: { type: 'not_found' },
    });
  });
});
