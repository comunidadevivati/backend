import { describe, expect, it } from 'vitest';
import {
  address,
  congregationDetails,
  congregationSnapshot,
  organizationDetails,
  organizationSnapshot,
} from '../organization.fixtures.js';
import { Congregation } from './congregation.js';
import { Organization } from './organization.js';
import { InstitutionalCode } from './value-objects/institutional.js';

const unwrap = <T>(result: { ok: true; value: T } | { ok: false }): T => {
  if (!result.ok) {
    throw new Error('Resultado inesperado.');
  }

  return result.value;
};

describe('Organization', () => {
  it('deve alterar os dados preservando ID, situação e versão', () => {
    const organization = Organization.restore(organizationSnapshot());

    organization.updateDetails(
      organizationDetails({
        legalName: 'Igreja Viva',
        tradeName: 'Comunidade Viva',
        cnpj: '14.158.325/0001-01',
        address: { ...address, number: '1700' },
        phone: '(67) 3333-4444',
        email: 'Contato@Exemplo.com',
      }),
    );

    expect(organization.toSnapshot()).toEqual(
      organizationSnapshot({
        legalName: 'Igreja Viva',
        tradeName: 'Comunidade Viva',
        address: { ...address, number: '1700' },
        phone: '6733334444',
        email: 'contato@exemplo.com',
      }),
    );
  });

  it('deve inativar e reativar, recusando transições repetidas', () => {
    const organization = Organization.restore(organizationSnapshot());

    expect(organization.activate().ok).toBe(false);

    expect(organization.deactivate().ok).toBe(true);

    expect(organization.status).toBe('INACTIVE');

    expect(organization.deactivate().ok).toBe(false);

    expect(organization.activate().ok).toBe(true);

    expect(organization.status).toBe('ACTIVE');
  });

  it('não deve expor o estado interno pelo snapshot', () => {
    const organization = Organization.restore(organizationSnapshot());

    organization.toSnapshot().address.city = 'Outra';

    expect(organization.toSnapshot().address.city).toBe('Campo Grande');
  });
});

const register = () =>
  Congregation.register({
    id: 'nova',
    organizationId: 'org',
    code: unwrap(InstitutionalCode.create('cg-norte')),
    details: congregationDetails({
      name: 'Congregação Norte',
      cnpj: null,
      address,
      phone: null,
      email: null,
    }),
  });

describe('Congregation', () => {
  it('deve nascer DRAFT, fora da Sede e na versão 1', () => {
    expect(register().toSnapshot()).toEqual({
      id: 'nova',
      organizationId: 'org',
      code: 'CG-NORTE',
      name: 'Congregação Norte',
      cnpj: null,
      address,
      phone: null,
      email: null,
      headquarters: false,
      status: 'DRAFT',
      version: 1,
    });
  });

  it('deve ativar a partir de DRAFT, inativar e reativar', () => {
    const congregation = register();

    expect(congregation.deactivate().ok).toBe(false);

    expect(congregation.activate().ok).toBe(true);

    expect(congregation.activate().ok).toBe(false);

    expect(congregation.deactivate().ok).toBe(true);

    expect(congregation.status).toBe('INACTIVE');

    expect(congregation.activate().ok).toBe(true);
  });

  it('deve alterar os dados sem mudar código, Sede ou organização', () => {
    const congregation = Congregation.restore(congregationSnapshot());

    congregation.updateDetails(
      congregationDetails({
        name: 'Sede Central',
        cnpj: null,
        address,
        phone: null,
        email: null,
      }),
    );

    expect(congregation.toSnapshot()).toEqual(
      congregationSnapshot({ name: 'Sede Central', cnpj: null, phone: null, email: null }),
    );

    expect(congregation.organizationId).toBe(congregationSnapshot().organizationId);
  });
});
