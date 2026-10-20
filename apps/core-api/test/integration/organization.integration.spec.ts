import { describe, expect, it } from 'vitest';
import { call } from './support/core-api-test-context.js';

const ORGANIZATION_ID = '01a14f8e-8ea4-7f34-ad19-0e85d0e1237c';

const HEADQUARTERS_ID = '01a14f8e-8ea5-7368-af3f-f594815a5aba';

const matrizAddress = {
  street: 'Av. Roseira',
  number: '1684',
  complement: null,
  district: 'Parque Residencial dos Girassóis',
  city: 'Campo Grande',
  state: 'MS',
  postalCode: '79091848',
};

const newCongregation = {
  code: 'cg-norte',
  name: 'Congregação Norte',
  address: { ...matrizAddress, street: 'Rua das Flores', number: '10', postalCode: '79000-000' },
  phone: '(67) 3333-4444',
};

describe('Organization (PostgreSQL real)', () => {
  it('deve exigir a credencial de serviço em toda rota do contexto', async () => {
    for (const url of ['organization', 'congregations']) {
      const response = await call('GET', url, undefined, 'token-invalido');

      expect(response.statusCode).toBe(401);

      expect(response.headers['content-type']).toContain('application/problem+json');
    }
  });

  it('deve criar a Matriz e a Sede ativas pela migration inicial', async () => {
    const organization = await call('GET', 'organization');

    expect(organization.json()).toEqual({
      id: ORGANIZATION_ID,
      legalName: 'IGREJA EVANGELICA VIVA E EFICAZ',
      tradeName: 'IGREJA EVANGELICA VIVA E EFICAZ',
      cnpj: '14158325000101',
      address: matrizAddress,
      phone: '67992550858',
      email: 'comvivati@gmail.com',
      status: 'ACTIVE',
      version: 1,
    });

    const headquarters = await call('GET', `congregations/${HEADQUARTERS_ID}`);

    expect(headquarters.json()).toMatchObject({
      organizationId: ORGANIZATION_ID,
      code: 'SEDE',
      cnpj: '14158325000101',
      address: matrizAddress,
      headquarters: true,
      status: 'ACTIVE',
    });
  });

  it('deve alterar a organização com controle otimista de versão', async () => {
    const updated = await call('PATCH', 'organization', {
      version: 1,
      tradeName: 'Comunidade Viva e Eficaz',
      address: { complement: 'Templo' },
    });

    expect(updated.statusCode).toBe(200);

    expect(updated.json()).toMatchObject({
      tradeName: 'Comunidade Viva e Eficaz',
      address: { ...matrizAddress, complement: 'Templo' },
      version: 2,
    });

    const stale = await call('PATCH', 'organization', { version: 1, tradeName: 'Outro' });

    expect(stale.statusCode).toBe(409);

    expect((await call('GET', 'organization')).json()).toMatchObject({ version: 2 });
  });

  it('deve responder 400 com os campos inválidos, sem ecoar valores', async () => {
    const response = await call('PATCH', 'organization', {
      version: 2,
      cnpj: '11.111.111/1111-11',
      address: { state: 'XX' },
    });

    expect(response.statusCode).toBe(400);

    expect(response.json()).toEqual({
      type: 'about:blank',
      title: 'Requisição inválida',
      status: 400,
      detail: 'Dados inválidos.',
      fields: ['cnpj', 'address.state'],
    });
  });

  it('deve registrar, alterar, ativar, inativar e reativar uma congregação', async () => {
    const created = await call('POST', 'congregations', newCongregation);

    expect(created.statusCode).toBe(201);

    const congregation = created.json<{ id: string }>();

    expect(congregation).toMatchObject({
      organizationId: ORGANIZATION_ID,
      code: 'CG-NORTE',
      address: { postalCode: '79000000' },
      phone: '6733334444',
      email: null,
      headquarters: false,
      status: 'DRAFT',
      version: 1,
    });

    const path = `congregations/${congregation.id}`;

    expect(
      (await call('PATCH', path, { version: 1, email: 'Norte@Exemplo.com' })).json(),
    ).toMatchObject({ email: 'norte@exemplo.com', version: 2 });

    expect((await call('POST', `${path}/activate`)).json()).toMatchObject({ status: 'ACTIVE' });

    expect((await call('POST', `${path}/activate`)).statusCode).toBe(409);

    expect((await call('POST', `${path}/deactivate`)).json()).toMatchObject({
      status: 'INACTIVE',
      version: 4,
    });

    expect((await call('POST', `${path}/activate`)).json()).toMatchObject({ status: 'ACTIVE' });

    expect((await call('POST', 'congregations', newCongregation)).statusCode).toBe(409);
  });

  it('deve listar por cursor e filtrar pela situação', async () => {
    const first = await call('GET', 'congregations?limit=1');

    expect(first.json()).toMatchObject({
      items: [{ id: HEADQUARTERS_ID }],
      nextCursor: HEADQUARTERS_ID,
    });

    const second = await call('GET', `congregations?limit=1&cursor=${HEADQUARTERS_ID}`);

    expect(second.json()).toMatchObject({ items: [{ code: 'CG-NORTE' }], nextCursor: null });

    expect((await call('GET', 'congregations?status=DRAFT')).json()).toEqual({
      items: [],
      nextCursor: null,
    });
  });

  it('não deve ativar congregações com a organização inativa', async () => {
    expect((await call('POST', 'organization/deactivate')).json()).toMatchObject({
      status: 'INACTIVE',
    });

    const created = await call('POST', 'congregations', { ...newCongregation, code: 'CG-SUL' });

    expect(created.statusCode).toBe(409);

    expect((await call('POST', 'organization/activate')).json()).toMatchObject({
      status: 'ACTIVE',
    });
  });

  it('deve responder 404 para congregação inexistente ou ID inválido', async () => {
    expect(
      (await call('GET', 'congregations/01a14f8e-0000-7000-8000-000000000000')).statusCode,
    ).toBe(404);

    expect((await call('GET', 'congregations/nao-e-uuid')).statusCode).toBe(404);
  });
});
