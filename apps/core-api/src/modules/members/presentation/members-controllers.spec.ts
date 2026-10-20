import { describe, expect, it } from 'vitest';
import {
  ChangeMemberStatusUseCase,
  EnrollMemberUseCase,
  GetMemberUseCase,
  ListMembersUseCase,
} from '../application/member.use-cases.js';
import {
  ChangeMembershipStatusUseCase,
  ListMembershipsUseCase,
  RegisterMembershipUseCase,
} from '../application/membership.use-cases.js';
import {
  ACCOUNT_ID,
  FixedClock,
  HEADQUARTERS_ID,
  InMemoryMemberQueries,
  InMemoryMemberRepository,
  InMemoryMembershipRepository,
  MEMBER_ID,
  memberView,
  SequentialIdGenerator,
  StubCongregationCatalog,
} from '../members.fixtures.js';
import { MembersController } from './members.controller.js';
import { MembershipsController } from './memberships.controller.js';
import type { FastifyReply } from 'fastify';

const NEW_ACCOUNT_ID = '01a14f8e-e000-7000-8000-0000000000aa';

// Resposta do Fastify: registra somente o status definido pelo controller.
const createReply = () => {
  const reply = {
    statusCode: 0,
    status: (code: number) => {
      reply.statusCode = code;

      return reply;
    },
  };

  return reply;
};

const asReply = (reply: ReturnType<typeof createReply>) => reply as unknown as FastifyReply;

const createControllers = () => {
  const memberships = new InMemoryMembershipRepository();

  const members = new InMemoryMemberRepository();

  const queries = new InMemoryMemberQueries(members, memberships);

  const catalog = new StubCongregationCatalog();

  const clock = new FixedClock();

  const ids = new SequentialIdGenerator();

  return {
    members: new MembersController(
      new ListMembersUseCase(queries),
      new GetMemberUseCase(queries),
      new EnrollMemberUseCase(members, queries, ids, clock),
      new ChangeMemberStatusUseCase(members, queries, memberships),
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
  it('deve listar com valores padrão e consultar membros com os dados da Pessoa', async () => {
    const { members } = createControllers();

    await expect(members.list({})).resolves.toEqual({
      items: [memberView()],
      nextCursor: null,
    });

    await expect(members.list({ search: '  ' })).resolves.toMatchObject({ nextCursor: null });

    await expect(members.get(MEMBER_ID)).resolves.toEqual(memberView());
  });

  it('deve converter a conta em Pessoa e membro: 201 ao criar, 200 ao repetir', async () => {
    const { members } = createControllers();

    const created = createReply();

    await expect(
      members.enroll({ accountId: NEW_ACCOUNT_ID, fullName: 'Ana Lima' }, asReply(created)),
    ).resolves.toMatchObject({
      status: 'ACTIVE',
      person: { fullName: 'Ana Lima', birthDate: null },
    });

    expect(created.statusCode).toBe(201);

    const repeated = createReply();

    await expect(
      members.enroll({ accountId: ACCOUNT_ID, fullName: 'Outro Nome' }, asReply(repeated)),
    ).resolves.toEqual(memberView());

    expect(repeated.statusCode).toBe(200);
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

    await expect(
      problemOf(members.enroll({ fullName: 1, extra: true }, asReply(createReply()))),
    ).resolves.toMatchObject({ status: 400, fields: ['accountId', 'fullName', 'body'] });

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
      problemOf(
        members.enroll(
          { accountId: NEW_ACCOUNT_ID, fullName: 'Ana Lima', email: 'invalido' },
          asReply(createReply()),
        ),
      ),
    ).resolves.toMatchObject({ status: 400, fields: ['email'] });
  });
});
