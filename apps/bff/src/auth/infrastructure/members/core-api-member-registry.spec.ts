import { describe, expect, it, vi } from 'vitest';
import { CoreApiMemberRegistry } from './core-api-member-registry.js';
import type { CoreApiClient } from '../../../core-api/infrastructure/core-api.client.js';

const PERSON_ID = '01a14f8e-d000-7000-8000-000000000050';

const registration = {
  accountId: '01a14f8e-a000-7000-8000-000000000001',
  fullName: 'Paula Ribeiro',
  email: 'paula@exemplo.com',
  phone: null,
};

const createRegistry = (status: number, body: unknown) => {
  const send = vi.fn(() => Promise.resolve({ status, contentType: 'application/json', body }));

  return { registry: new CoreApiMemberRegistry({ send } as unknown as CoreApiClient), send };
};

describe('CoreApiMemberRegistry', () => {
  it.each([201, 200])(
    'deve converter na Core API e devolver o ID da Pessoa (%i)',
    async (status) => {
      const { registry, send } = createRegistry(status, {
        id: '01a14f8e-a000-7000-8000-000000000050',
        status: 'ACTIVE',
        person: { id: PERSON_ID, fullName: 'Paula Ribeiro' },
      });

      await expect(registry.register(registration)).resolves.toBe(PERSON_ID);

      expect(send).toHaveBeenCalledWith({ method: 'POST', path: 'members', body: registration });
    },
  );

  it.each([400, 409])('deve tratar %i como recusa do registro', async (status) => {
    const { registry } = createRegistry(status, { detail: 'Dados inválidos.' });

    await expect(registry.register(registration)).resolves.toBeNull();
  });

  it.each([
    [401, null],
    [500, null],
    [201, { person: { id: 'x' } }],
  ])('deve falhar quando a Core API responde %i fora do contrato', async (status, body) => {
    const { registry } = createRegistry(status, body);

    await expect(registry.register(registration)).rejects.toThrow(`Core API respondeu ${status}`);
  });
});
