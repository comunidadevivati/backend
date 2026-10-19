import { describe, expect, it } from 'vitest';
import {
  ChangeCongregationStatusUseCase,
  GetCongregationUseCase,
  ListCongregationsUseCase,
  RegisterCongregationUseCase,
  UpdateCongregationUseCase,
} from '../application/congregation.use-cases.js';
import {
  ChangeOrganizationStatusUseCase,
  GetOrganizationUseCase,
  UpdateOrganizationUseCase,
} from '../application/organization.use-cases.js';
import {
  address,
  congregationSnapshot,
  HEADQUARTERS_ID,
  InMemoryCongregationRepository,
  InMemoryOrganizationRepository,
  organizationSnapshot,
  SequentialIdGenerator,
} from '../organization.fixtures.js';
import { CongregationsController } from './congregations.controller.js';
import { OrganizationController } from './organization.controller.js';

const createControllers = () => {
  const organizations = new InMemoryOrganizationRepository();

  const congregations = new InMemoryCongregationRepository();

  return {
    organization: new OrganizationController(
      new GetOrganizationUseCase(organizations),
      new UpdateOrganizationUseCase(organizations),
      new ChangeOrganizationStatusUseCase(organizations),
    ),
    congregations: new CongregationsController(
      new ListCongregationsUseCase(congregations),
      new GetCongregationUseCase(congregations),
      new RegisterCongregationUseCase(organizations, congregations, new SequentialIdGenerator()),
      new UpdateCongregationUseCase(congregations),
      new ChangeCongregationStatusUseCase(organizations, congregations),
    ),
  };
};

const problemOf = async (promise: Promise<unknown>) => {
  const error: unknown = await promise.catch((caught: unknown) => caught);

  return (error as { getResponse: () => unknown }).getResponse();
};

describe('OrganizationController', () => {
  it('deve consultar, alterar e mudar a situação da organização', async () => {
    const { organization } = createControllers();

    await expect(organization.get()).resolves.toEqual(organizationSnapshot());

    await expect(organization.update({ version: 1, tradeName: 'Viva' })).resolves.toMatchObject({
      tradeName: 'Viva',
      version: 2,
    });

    await expect(organization.deactivate()).resolves.toMatchObject({ status: 'INACTIVE' });

    await expect(organization.activate()).resolves.toMatchObject({ status: 'ACTIVE' });
  });

  it('deve recusar corpo inválido no transporte, listando os campos', async () => {
    const { organization } = createControllers();

    await expect(problemOf(organization.update({ cnpj: 1, extra: true }))).resolves.toMatchObject({
      status: 400,
      fields: ['version', 'cnpj', 'body'],
    });

    const missingBody: unknown = undefined;

    await expect(problemOf(organization.update(missingBody))).resolves.toMatchObject({
      fields: ['version'],
    });
  });

  it.each([
    [{ version: 9 }, 409],
    [{ version: 1, email: 'x' }, 400],
  ])('deve mapear os erros esperados para Problem Details (%o)', async (body, status) => {
    const { organization } = createControllers();

    await expect(problemOf(organization.update(body))).resolves.toMatchObject({ status });
  });
});

describe('CongregationsController', () => {
  it('deve listar com os padrões de paginação e consultar por ID', async () => {
    const { congregations } = createControllers();

    await expect(congregations.list({})).resolves.toEqual({
      items: [congregationSnapshot()],
      nextCursor: null,
    });

    await expect(congregations.get(HEADQUARTERS_ID)).resolves.toEqual(congregationSnapshot());
  });

  it('deve recusar filtros inválidos e IDs fora do formato UUID', async () => {
    const { congregations } = createControllers();

    await expect(
      problemOf(congregations.list({ status: 'X', limit: '500', cursor: 'abc' })),
    ).resolves.toMatchObject({ status: 400, fields: ['status', 'cursor', 'limit'] });

    await expect(problemOf(congregations.get('abc'))).resolves.toMatchObject({ status: 404 });
  });

  it('deve registrar, alterar, ativar e inativar uma congregação', async () => {
    const { congregations } = createControllers();

    const created = await congregations.register({ code: 'CG-SUL', name: 'Sul', address });

    expect(created).toMatchObject({ status: 'DRAFT', cnpj: null, phone: null, email: null });

    await expect(
      congregations.update(created.id, { version: 1, name: 'Congregação Sul' }),
    ).resolves.toMatchObject({ name: 'Congregação Sul', version: 2 });

    await expect(congregations.activate(created.id)).resolves.toMatchObject({ status: 'ACTIVE' });

    await expect(congregations.deactivate(created.id)).resolves.toMatchObject({
      status: 'INACTIVE',
    });
  });

  it.each([
    ['código repetido', { code: 'SEDE', name: 'Outra', address }, 409],
    ['endereço ausente', { code: 'X1', name: 'Outra' }, 400],
  ])('deve recusar o registro com %s', async (_caso, body, status) => {
    const { congregations } = createControllers();

    await expect(problemOf(congregations.register(body))).resolves.toMatchObject({ status });
  });

  it('deve recusar a transição inválida e o código no corpo da alteração', async () => {
    const { congregations } = createControllers();

    await expect(problemOf(congregations.activate(HEADQUARTERS_ID))).resolves.toMatchObject({
      status: 409,
      detail: 'A situação atual não permite esta operação.',
    });

    await expect(
      problemOf(congregations.update(HEADQUARTERS_ID, { version: 1, code: 'NOVO' })),
    ).resolves.toMatchObject({ status: 400, fields: ['body'] });
  });
});
