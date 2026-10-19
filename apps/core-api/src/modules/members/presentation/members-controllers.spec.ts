import { describe, expect, it } from 'vitest';
import {
  ChangeMemberStatusUseCase,
  GetMemberUseCase,
  ListMembersUseCase,
  RegisterMemberUseCase,
  UpdateMemberUseCase,
} from '../application/member.use-cases.js';
import {
  ChangeMembershipStatusUseCase,
  ListMembershipsUseCase,
  RegisterMembershipUseCase,
} from '../application/membership.use-cases.js';
import {
  FixedClock,
  HEADQUARTERS_ID,
  InMemoryMemberRepository,
  InMemoryMembershipRepository,
  MEMBER_ID,
  memberSnapshot,
  SequentialIdGenerator,
  StubCongregationCatalog,
} from '../members.fixtures.js';
import { MembersController } from './members.controller.js';
import { MembershipsController } from './memberships.controller.js';

const createControllers = () => {
  const memberships = new InMemoryMembershipRepository();

  const members = new InMemoryMemberRepository([memberSnapshot()], memberships);

  const catalog = new StubCongregationCatalog();

  const clock = new FixedClock();

  const ids = new SequentialIdGenerator();

  return {
    members: new MembersController(
      new ListMembersUseCase(members),
      new GetMemberUseCase(members),
      new RegisterMemberUseCase(members, ids, clock),
      new UpdateMemberUseCase(members, clock),
      new ChangeMemberStatusUseCase(members, memberships),
      new ListMembershipsUseCase(members, memberships, catalog),
      new RegisterMembershipUseCase(members, memberships, catalog, ids),
    ),
    memberships: new MembershipsController(
      new ChangeMembershipStatusUseCase(members, memberships, catalog, clock),
    ),
  };
};

const problemOf = async (promise: Promise<unknown>) => {
  const error: unknown = await promise.catch((caught: unknown) => caught);

  return (error as { getResponse: () => unknown }).getResponse();
};

describe('MembersController', () => {
  it('deve listar com valores padrão e consultar, registrar e alterar membros', async () => {
    const { members } = createControllers();

    await expect(members.list({})).resolves.toEqual({
      items: [memberSnapshot()],
      nextCursor: null,
    });

    await expect(members.list({ search: '  ' })).resolves.toMatchObject({ nextCursor: null });

    await expect(members.get(MEMBER_ID)).resolves.toEqual(memberSnapshot());

    await expect(members.register({ fullName: 'Ana Lima' })).resolves.toMatchObject({
      fullName: 'Ana Lima',
      birthDate: null,
      status: 'ACTIVE',
    });

    await expect(
      members.update(MEMBER_ID, { version: 1, fullName: 'Maria Souza' }),
    ).resolves.toMatchObject({ fullName: 'Maria Souza', version: 2 });
  });

  it('deve mudar a situação do membro', async () => {
    const { members } = createControllers();

    await expect(members.deactivate(MEMBER_ID)).resolves.toMatchObject({ status: 'INACTIVE' });

    await expect(members.archive(MEMBER_ID)).resolves.toMatchObject({ status: 'ARCHIVED' });

    await expect(members.restore(MEMBER_ID)).resolves.toMatchObject({ status: 'INACTIVE' });

    await expect(members.activate(MEMBER_ID)).resolves.toMatchObject({ status: 'ACTIVE' });
  });

  it('deve registrar, listar, ativar e encerrar vínculos', async () => {
    const { members, memberships } = createControllers();

    const added = await members.addMembership(MEMBER_ID, {
      congregationId: HEADQUARTERS_ID,
      primary: true,
    });

    expect(added).toMatchObject({ status: 'PENDING', congregation: { code: 'SEDE' } });

    await expect(memberships.activate(added.id)).resolves.toMatchObject({ status: 'ACTIVE' });

    await expect(memberships.deactivate(added.id)).resolves.toMatchObject({ status: 'INACTIVE' });

    await expect(members.memberships(MEMBER_ID)).resolves.toHaveLength(1);
  });

  it('deve recusar entradas inválidas no transporte, listando os campos', async () => {
    const { members } = createControllers();

    await expect(problemOf(members.register({ fullName: 1, extra: true }))).resolves.toMatchObject({
      status: 400,
      fields: ['fullName', 'body'],
    });

    await expect(problemOf(members.list({ status: 'X', limit: '0' }))).resolves.toMatchObject({
      status: 400,
      fields: ['status', 'limit'],
    });

    await expect(
      problemOf(members.addMembership(MEMBER_ID, { congregationId: 'x' })),
    ).resolves.toMatchObject({ status: 400, fields: ['congregationId'] });
  });

  it('deve mapear os erros esperados para Problem Details', async () => {
    const { members, memberships } = createControllers();

    await expect(problemOf(members.get('nao-e-uuid'))).resolves.toMatchObject({ status: 404 });

    await expect(problemOf(memberships.activate('nao-e-uuid'))).resolves.toMatchObject({
      status: 404,
    });

    await expect(problemOf(members.activate(MEMBER_ID))).resolves.toMatchObject({
      status: 409,
      detail: 'A situação atual não permite esta operação.',
    });

    await expect(
      problemOf(members.update(MEMBER_ID, { version: 1, email: 'invalido' })),
    ).resolves.toMatchObject({ status: 400, fields: ['email'] });
  });
});
