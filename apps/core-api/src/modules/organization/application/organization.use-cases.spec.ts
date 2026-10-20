import { describe, expect, it } from 'vitest';
import { InMemoryOrganizationRepository, organizationSnapshot } from '../organization.fixtures.js';
import {
  ChangeOrganizationStatusUseCase,
  GetOrganizationUseCase,
  UpdateOrganizationUseCase,
} from './organization.use-cases.js';

describe('GetOrganizationUseCase', () => {
  it('deve retornar a organização principal', async () => {
    const useCase = new GetOrganizationUseCase(new InMemoryOrganizationRepository());

    await expect(useCase.execute()).resolves.toEqual({ ok: true, value: organizationSnapshot() });
  });

  it('deve informar a ausência da organização', async () => {
    const useCase = new GetOrganizationUseCase(new InMemoryOrganizationRepository(null));

    await expect(useCase.execute()).resolves.toEqual({ ok: false, error: { type: 'not_found' } });
  });
});

describe('UpdateOrganizationUseCase', () => {
  it('deve aplicar a alteração parcial, inclusive campo a campo no endereço', async () => {
    const repository = new InMemoryOrganizationRepository();

    const result = await new UpdateOrganizationUseCase(repository).execute({
      expectedVersion: 1,
      patch: { tradeName: 'Comunidade Viva', phone: undefined, address: { number: '1700' } },
    });

    expect(result).toEqual({
      ok: true,
      value: organizationSnapshot({
        tradeName: 'Comunidade Viva',
        address: { ...organizationSnapshot().address, number: '1700' },
        version: 2,
      }),
    });

    expect(repository.stored?.version).toBe(2);
  });

  it('deve recusar dados inválidos informando somente os campos', async () => {
    const result = await new UpdateOrganizationUseCase(
      new InMemoryOrganizationRepository(),
    ).execute({ expectedVersion: 1, patch: { cnpj: '123', address: { state: 'XX' }, email: 'x' } });

    expect(result).toEqual({
      ok: false,
      error: { type: 'invalid_fields', fields: ['cnpj', 'address.state', 'email'] },
    });
  });

  it('deve recusar uma versão desatualizada e uma escrita concorrente', async () => {
    const repository = new InMemoryOrganizationRepository();

    const useCase = new UpdateOrganizationUseCase(repository);

    await expect(useCase.execute({ expectedVersion: 7, patch: {} })).resolves.toEqual({
      ok: false,
      error: { type: 'version_conflict' },
    });

    repository.failNextUpdate = true;

    await expect(useCase.execute({ expectedVersion: 1, patch: {} })).resolves.toEqual({
      ok: false,
      error: { type: 'version_conflict' },
    });
  });

  it('deve informar a ausência da organização', async () => {
    const useCase = new UpdateOrganizationUseCase(new InMemoryOrganizationRepository(null));

    await expect(useCase.execute({ expectedVersion: 1, patch: {} })).resolves.toMatchObject({
      error: { type: 'not_found' },
    });
  });
});

describe('ChangeOrganizationStatusUseCase', () => {
  it('deve inativar e reativar incrementando a versão', async () => {
    const repository = new InMemoryOrganizationRepository();

    const useCase = new ChangeOrganizationStatusUseCase(repository);

    await expect(useCase.execute('deactivate')).resolves.toMatchObject({
      value: { status: 'INACTIVE', version: 2 },
    });

    await expect(useCase.execute('activate')).resolves.toMatchObject({
      value: { status: 'ACTIVE', version: 3 },
    });
  });

  it('deve recusar transições inválidas, ausência e escrita concorrente', async () => {
    const repository = new InMemoryOrganizationRepository();

    const useCase = new ChangeOrganizationStatusUseCase(repository);

    await expect(useCase.execute('activate')).resolves.toMatchObject({
      error: { type: 'invalid_status_transition' },
    });

    repository.failNextUpdate = true;

    await expect(useCase.execute('deactivate')).resolves.toMatchObject({
      error: { type: 'version_conflict' },
    });

    await expect(
      new ChangeOrganizationStatusUseCase(new InMemoryOrganizationRepository(null)).execute(
        'activate',
      ),
    ).resolves.toMatchObject({ error: { type: 'not_found' } });
  });
});
