import { describe, expect, it } from 'vitest';
import {
  address,
  congregationSnapshot,
  HEADQUARTERS_ID,
  InMemoryCongregationRepository,
  InMemoryOrganizationRepository,
  organizationSnapshot,
  SequentialIdGenerator,
} from '../organization.fixtures.js';
import {
  ChangeCongregationStatusUseCase,
  GetCongregationUseCase,
  ListCongregationsUseCase,
  RegisterCongregationUseCase,
  UpdateCongregationUseCase,
} from './congregation.use-cases.js';

const DRAFT_ID = '01a14f8e-9000-7000-8000-000000000099';

const draft = congregationSnapshot({
  id: DRAFT_ID,
  code: 'CG-NORTE',
  name: 'Congregação Norte',
  headquarters: false,
  status: 'DRAFT',
});

const registration = {
  code: 'cg-sul',
  name: 'Congregação Sul',
  cnpj: null,
  address,
  phone: '(67) 3333-4444',
  email: '',
};

describe('ListCongregationsUseCase', () => {
  it('deve paginar por cursor e indicar a próxima página', async () => {
    const repository = new InMemoryCongregationRepository([congregationSnapshot(), draft]);

    const useCase = new ListCongregationsUseCase(repository);

    const first = await useCase.execute({ status: null, cursor: null, limit: 1 });

    expect(first).toEqual({ items: [congregationSnapshot()], nextCursor: HEADQUARTERS_ID });

    expect(repository.lastQuery).toEqual({ status: null, after: null, limit: 2 });

    await expect(
      useCase.execute({ status: null, cursor: HEADQUARTERS_ID, limit: 1 }),
    ).resolves.toEqual({ items: [draft], nextCursor: null });
  });

  it('deve filtrar pela situação', async () => {
    const useCase = new ListCongregationsUseCase(
      new InMemoryCongregationRepository([congregationSnapshot(), draft]),
    );

    await expect(useCase.execute({ status: 'DRAFT', cursor: null, limit: 20 })).resolves.toEqual({
      items: [draft],
      nextCursor: null,
    });
  });
});

describe('GetCongregationUseCase', () => {
  it('deve retornar a congregação ou informar a ausência', async () => {
    const useCase = new GetCongregationUseCase(new InMemoryCongregationRepository());

    await expect(useCase.execute(HEADQUARTERS_ID)).resolves.toEqual({
      ok: true,
      value: congregationSnapshot(),
    });

    await expect(useCase.execute(DRAFT_ID)).resolves.toMatchObject({
      error: { type: 'not_found' },
    });
  });
});

const createRegisterUseCase = (organization = organizationSnapshot()) => {
  const congregations = new InMemoryCongregationRepository();

  return {
    congregations,
    useCase: new RegisterCongregationUseCase(
      new InMemoryOrganizationRepository(organization),
      congregations,
      new SequentialIdGenerator(),
    ),
  };
};

describe('RegisterCongregationUseCase', () => {
  it('deve registrar a congregação DRAFT na organização principal', async () => {
    const { congregations, useCase } = createRegisterUseCase();

    const result = await useCase.execute(registration);

    expect(result).toEqual({
      ok: true,
      value: {
        id: '01a14f8e-9000-7000-8000-000000000001',
        organizationId: organizationSnapshot().id,
        code: 'CG-SUL',
        name: 'Congregação Sul',
        cnpj: null,
        address,
        phone: '6733334444',
        email: null,
        headquarters: false,
        status: 'DRAFT',
        version: 1,
      },
    });

    expect(congregations.stored.size).toBe(2);
  });

  it('deve recusar código e dados inválidos de uma vez', async () => {
    const { useCase } = createRegisterUseCase();

    await expect(
      useCase.execute({
        ...registration,
        code: '-',
        cnpj: '123',
        address: { ...address, city: '' },
      }),
    ).resolves.toEqual({
      ok: false,
      error: { type: 'invalid_fields', fields: ['code', 'cnpj', 'address.city'] },
    });

    await expect(useCase.execute({ ...registration, phone: '1' })).resolves.toMatchObject({
      error: { fields: ['phone'] },
    });
  });

  it('deve recusar código repetido', async () => {
    const { useCase } = createRegisterUseCase();

    await expect(useCase.execute({ ...registration, code: 'sede' })).resolves.toEqual({
      ok: false,
      error: { type: 'code_taken' },
    });
  });

  it('deve exigir a organização ativa', async () => {
    await expect(
      createRegisterUseCase(organizationSnapshot({ status: 'INACTIVE' })).useCase.execute(
        registration,
      ),
    ).resolves.toMatchObject({ error: { type: 'organization_inactive' } });

    const missing = new RegisterCongregationUseCase(
      new InMemoryOrganizationRepository(null),
      new InMemoryCongregationRepository(),
      new SequentialIdGenerator(),
    );

    await expect(missing.execute(registration)).resolves.toMatchObject({
      error: { type: 'not_found' },
    });
  });
});

describe('UpdateCongregationUseCase', () => {
  it('deve aplicar a alteração parcial e permitir limpar campos opcionais', async () => {
    const useCase = new UpdateCongregationUseCase(new InMemoryCongregationRepository());

    await expect(
      useCase.execute({
        id: HEADQUARTERS_ID,
        expectedVersion: 1,
        patch: { name: 'Sede Central', cnpj: null, address: { complement: 'Sala 2' } },
      }),
    ).resolves.toEqual({
      ok: true,
      value: congregationSnapshot({
        name: 'Sede Central',
        cnpj: null,
        address: { ...address, complement: 'Sala 2' },
        version: 2,
      }),
    });
  });

  it('deve recusar ausência, versão desatualizada, dados inválidos e escrita concorrente', async () => {
    const repository = new InMemoryCongregationRepository();

    const useCase = new UpdateCongregationUseCase(repository);

    const update = (expectedVersion: number, patch = {}) =>
      useCase.execute({ id: HEADQUARTERS_ID, expectedVersion, patch });

    await expect(
      useCase.execute({ id: DRAFT_ID, expectedVersion: 1, patch: {} }),
    ).resolves.toMatchObject({ error: { type: 'not_found' } });

    await expect(update(2)).resolves.toMatchObject({ error: { type: 'version_conflict' } });

    await expect(update(1, { email: 'x' })).resolves.toMatchObject({
      error: { type: 'invalid_fields', fields: ['email'] },
    });

    repository.failNextUpdate = true;

    await expect(update(1)).resolves.toMatchObject({ error: { type: 'version_conflict' } });
  });
});

const createStatusUseCase = (organization = organizationSnapshot()) => {
  const congregations = new InMemoryCongregationRepository([congregationSnapshot(), draft]);

  return {
    congregations,
    useCase: new ChangeCongregationStatusUseCase(
      new InMemoryOrganizationRepository(organization),
      congregations,
    ),
  };
};

describe('ChangeCongregationStatusUseCase', () => {
  it('deve ativar, inativar e reativar', async () => {
    const { useCase } = createStatusUseCase();

    await expect(useCase.execute({ id: DRAFT_ID, action: 'activate' })).resolves.toMatchObject({
      value: { status: 'ACTIVE', version: 2 },
    });

    await expect(useCase.execute({ id: DRAFT_ID, action: 'deactivate' })).resolves.toMatchObject({
      value: { status: 'INACTIVE', version: 3 },
    });

    await expect(useCase.execute({ id: DRAFT_ID, action: 'activate' })).resolves.toMatchObject({
      value: { status: 'ACTIVE', version: 4 },
    });
  });

  it('deve permitir inativar, mas não ativar, sob organização inativa', async () => {
    const { useCase } = createStatusUseCase(organizationSnapshot({ status: 'INACTIVE' }));

    await expect(useCase.execute({ id: DRAFT_ID, action: 'activate' })).resolves.toMatchObject({
      error: { type: 'organization_inactive' },
    });

    await expect(
      useCase.execute({ id: HEADQUARTERS_ID, action: 'deactivate' }),
    ).resolves.toMatchObject({ value: { status: 'INACTIVE' } });
  });

  it('deve recusar ausência, transição inválida e escrita concorrente', async () => {
    const { congregations, useCase } = createStatusUseCase();

    await expect(
      useCase.execute({ id: '01a14f8e-9000-7000-8000-000000000000', action: 'activate' }),
    ).resolves.toMatchObject({ error: { type: 'not_found' } });

    await expect(useCase.execute({ id: DRAFT_ID, action: 'deactivate' })).resolves.toMatchObject({
      error: { type: 'invalid_status_transition' },
    });

    congregations.failNextUpdate = true;

    await expect(
      useCase.execute({ id: HEADQUARTERS_ID, action: 'deactivate' }),
    ).resolves.toMatchObject({ error: { type: 'version_conflict' } });
  });
});
