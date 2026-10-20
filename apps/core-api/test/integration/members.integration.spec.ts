import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { call } from './support/core-api-test-context.js';

const HEADQUARTERS_ID = '01a14f8e-8ea5-7368-af3f-f594815a5aba';

const UNKNOWN_ID = '01a14f8e-ffff-7000-8000-000000000000';

interface Member {
  id: string;
  status: string;
  version: number;
  person: { id: string; fullName: string };
}

interface Membership {
  id: string;
  status: string;
  startedOn: string | null;
  endedOn: string | null;
}

// Conta verificada do BFF (simulada por um UUID novo) convertida em Pessoa e membro.
const registerMember = async (fullName: string) => {
  const response = await call('POST', 'members', { accountId: randomUUID(), fullName });

  expect(response.statusCode).toBe(201);

  return response.json<Member>();
};

// Congregação ativa adicional (registrada DRAFT e ativada).
const activeCongregation = async (code: string) => {
  const registered = await call('POST', 'congregations', {
    code,
    name: `Congregação ${code}`,
    address: {
      street: 'Rua das Flores',
      number: '10',
      district: 'Centro',
      city: 'Campo Grande',
      state: 'MS',
      postalCode: '79000000',
    },
  });

  const { id } = registered.json<{ id: string }>();

  await call('POST', `congregations/${id}/activate`);

  return id;
};

describe('Members (PostgreSQL real)', () => {
  it('deve exigir a credencial de serviço', async () => {
    for (const url of ['members', `memberships/${UNKNOWN_ID}/activate`]) {
      const response = await call(url === 'members' ? 'GET' : 'POST', url, undefined, 'invalido');

      expect(response.statusCode).toBe(401);
    }
  });

  it('deve converter a conta em Pessoa e membro uma única vez e filtrar pelo nome', async () => {
    const accountId = randomUUID();

    const enrollment = {
      accountId,
      fullName: '  Maria   da Silva ',
      phone: '(67) 99255-0858',
      email: 'Maria@Exemplo.com',
    };

    const created = await call('POST', 'members', enrollment);

    expect(created.statusCode).toBe(201);

    const member = created.json<Member>();

    expect(member).toMatchObject({
      status: 'ACTIVE',
      version: 1,
      person: {
        fullName: 'Maria da Silva',
        birthDate: null,
        phone: '67992550858',
        email: 'maria@exemplo.com',
      },
    });

    // Repetir (ou pedidos simultâneos) para a mesma conta devolve o mesmo membro.
    const [again, concurrent] = await Promise.all([
      call('POST', 'members', enrollment),
      call('POST', 'members', { ...enrollment, fullName: 'Outro Nome' }),
    ]);

    expect([again.statusCode, concurrent.statusCode]).toEqual([200, 200]);

    expect(concurrent.json()).toEqual(member);

    expect((await call('GET', `members/${member.id}`)).json()).toEqual(member);

    // Não há edição de dados pessoais pelo membro: eles pertencem à Pessoa.
    expect((await call('PATCH', `members/${member.id}`, { version: 1 })).statusCode).toBe(404);

    // Curingas digitados não funcionam como curinga do ILIKE.
    const wildcard = await call('GET', 'members?search=%25');

    expect(wildcard.json()).toEqual({ items: [], nextCursor: null });

    const found = await call('GET', 'members?search=MARIA&status=ACTIVE');

    expect(found.json<{ items: Member[] }>().items.map(({ id }) => id)).toContain(member.id);

    const invalid = await call('POST', 'members', {
      accountId: randomUUID(),
      fullName: 'X',
      birthDate: '2999-01-01',
    });

    expect(invalid.statusCode).toBe(400);

    expect(invalid.json()).toMatchObject({ fields: ['fullName', 'birthDate'] });

    expect((await call('POST', 'members', { fullName: 'Sem Conta' })).statusCode).toBe(400);
  });

  it('deve paginar membros por cursor', async () => {
    await registerMember('Pessoa Paginada Um');

    await registerMember('Pessoa Paginada Dois');

    const first = await call('GET', 'members?search=Paginada&limit=1');

    const page = first.json<{ items: Member[]; nextCursor: string }>();

    expect(page.items).toHaveLength(1);

    const second = await call('GET', `members?search=Paginada&limit=1&cursor=${page.nextCursor}`);

    expect(second.json()).toMatchObject({ nextCursor: null });
  });

  it('deve controlar o ciclo de vida dos vínculos e o vínculo principal único', async () => {
    const member = await registerMember('João Vinculado');

    const northId = await activeCongregation('CG-VINC');

    const primary = await call('POST', `members/${member.id}/memberships`, {
      congregationId: HEADQUARTERS_ID,
      primary: true,
    });

    expect(primary.statusCode).toBe(201);

    expect(primary.json()).toMatchObject({
      status: 'PENDING',
      primary: true,
      congregation: { code: 'SEDE' },
    });

    const duplicate = await call('POST', `members/${member.id}/memberships`, {
      congregationId: HEADQUARTERS_ID,
    });

    expect(duplicate.statusCode).toBe(409);

    const { id: primaryId } = primary.json<Membership>();

    const activated = await call('POST', `memberships/${primaryId}/activate`);

    expect(activated.statusCode).toBe(200);

    expect(activated.json<Membership>().startedOn).toMatch(/^\d{4}-\d{2}-\d{2}$/u);

    // Segundo vínculo principal: o índice parcial do banco impede dois principais ativos.
    const secondPrimary = await call('POST', `members/${member.id}/memberships`, {
      congregationId: northId,
      primary: true,
    });

    const conflict = await call(
      'POST',
      `memberships/${secondPrimary.json<Membership>().id}/activate`,
    );

    expect(conflict.statusCode).toBe(409);

    expect(conflict.json()).toMatchObject({
      detail: 'O membro já tem um vínculo principal ativo. Encerre-o antes de ativar outro.',
    });

    // Filtra membros pela congregação com vínculo aberto.
    const bySede = await call('GET', `members?congregationId=${HEADQUARTERS_ID}`);

    expect(bySede.json<{ items: Member[] }>().items.map(({ id }) => id)).toContain(member.id);

    // Com vínculos abertos, o membro não pode ser inativado.
    const blocked = await call('POST', `members/${member.id}/deactivate`);

    expect(blocked.statusCode).toBe(409);

    for (const id of [primaryId, secondPrimary.json<Membership>().id]) {
      const ended = await call('POST', `memberships/${id}/deactivate`);

      expect(ended.json<Membership>()).toMatchObject({ status: 'INACTIVE' });
    }

    // Histórico preservado e reabertura proibida: um novo vínculo é registrado.
    const history = await call('GET', `members/${member.id}/memberships`);

    expect(history.json<Membership[]>().map(({ status }) => status)).toEqual([
      'INACTIVE',
      'INACTIVE',
    ]);

    const reopen = await call('POST', `memberships/${primaryId}/activate`);

    expect(reopen.statusCode).toBe(409);

    const again = await call('POST', `members/${member.id}/memberships`, {
      congregationId: HEADQUARTERS_ID,
    });

    expect(again.statusCode).toBe(201);

    await call('POST', `memberships/${again.json<Membership>().id}/deactivate`);

    for (const action of ['deactivate', 'archive']) {
      const changed = await call('POST', `members/${member.id}/${action}`);

      expect(changed.statusCode).toBe(200);
    }

    const archived = await call('GET', `members/${member.id}`);

    expect(archived.json()).toMatchObject({
      status: 'ARCHIVED',
      person: { fullName: 'João Vinculado' },
    });
  });

  it('deve recusar vínculo com congregação inexistente ou não ativa', async () => {
    const member = await registerMember('Ana Sem Vínculo');

    const unknown = await call('POST', `members/${member.id}/memberships`, {
      congregationId: UNKNOWN_ID,
    });

    expect(unknown.statusCode).toBe(400);

    expect(unknown.json()).toMatchObject({ fields: ['congregationId'] });

    const draft = await call('POST', 'congregations', {
      code: 'CG-RASCUNHO',
      name: 'Congregação Rascunho',
      address: {
        street: 'Rua A',
        number: '1',
        district: 'Centro',
        city: 'Campo Grande',
        state: 'MS',
        postalCode: '79000000',
      },
    });

    const inactive = await call('POST', `members/${member.id}/memberships`, {
      congregationId: draft.json<{ id: string }>().id,
    });

    expect(inactive.statusCode).toBe(409);

    expect(inactive.json()).toMatchObject({ detail: 'A congregação não está ativa.' });
  });
});
