import { describe, expect, it } from 'vitest';
import { memberSnapshot, membershipSnapshot, TODAY } from '../members.fixtures.js';
import { Member, type MemberStatus, type MemberStatusAction } from './member.js';
import { Membership } from './membership.js';
import { Person, type PersonProfile } from './person.js';
import { BirthDate } from './value-objects/birth-date.js';
import { PersonName } from './value-objects/person-name.js';

const valueOf = <T extends { value: string }>(result: { ok: true; value: T } | { ok: false }) =>
  result.ok ? result.value.value : null;

const profile = (fullName = 'Maria da Silva'): PersonProfile => {
  const name = PersonName.create(fullName);

  if (!name.ok) {
    throw new Error('Nome de teste inválido.');
  }

  return { fullName: name.value, birthDate: null, phone: null, email: null };
};

describe('PersonName', () => {
  it('deve colapsar espaços e aceitar acentos, apóstrofo, ponto e hífen', () => {
    expect(valueOf(PersonName.create("  Maria   D'Ávila Santos-Lima Jr. "))).toBe(
      "Maria D'Ávila Santos-Lima Jr.",
    );
  });

  it.each([
    ['curto demais', 'A'],
    ['com números', 'Maria 2'],
    ['somente pontuação', "-- '"],
    ['longo demais', 'a'.repeat(121)],
  ])('deve recusar nome %s', (_caso, raw) => {
    expect(PersonName.create(raw).ok).toBe(false);
  });
});

describe('BirthDate', () => {
  it('deve aceitar datas ISO existentes até hoje', () => {
    expect(valueOf(BirthDate.create(' 2024-02-29 ', TODAY))).toBe('2024-02-29');

    expect(valueOf(BirthDate.create(TODAY, TODAY))).toBe(TODAY);
  });

  it.each([
    ['inexistente', '2023-02-30'],
    ['futura', '2026-10-20'],
    ['anterior a 1900', '1899-12-31'],
    ['fora do formato ISO', '20/05/1990'],
  ])('deve recusar data %s', (_caso, raw) => {
    expect(BirthDate.create(raw, TODAY).ok).toBe(false);
  });
});

describe('Person', () => {
  it('deve nascer na versão 1 com a conta de origem e os dados pessoais', () => {
    const person = Person.register('p-1', 'a-1', profile());

    expect(person.id).toBe('p-1');

    expect(person.toSnapshot()).toEqual({
      id: 'p-1',
      accountId: 'a-1',
      fullName: 'Maria da Silva',
      birthDate: null,
      phone: null,
      email: null,
      version: 1,
    });
  });
});

describe('Member', () => {
  it('deve nascer ACTIVE na versão 1, referenciando somente a Pessoa', () => {
    expect(Member.enroll('id-1', 'p-1').toSnapshot()).toEqual({
      id: 'id-1',
      personId: 'p-1',
      status: 'ACTIVE',
      version: 1,
    });
  });

  it.each<[MemberStatus, MemberStatusAction, MemberStatus | null]>([
    ['ACTIVE', 'deactivate', 'INACTIVE'],
    ['INACTIVE', 'activate', 'ACTIVE'],
    ['INACTIVE', 'archive', 'ARCHIVED'],
    ['ARCHIVED', 'restore', 'INACTIVE'],
    ['ACTIVE', 'activate', null],
    ['ACTIVE', 'archive', null],
    ['ARCHIVED', 'activate', null],
    ['INACTIVE', 'restore', null],
  ])('%s + %s → %s', (from, action, to) => {
    const member = Member.restore(memberSnapshot({ status: from }));

    expect(member.changeStatus(action).ok).toBe(to !== null);

    expect(member.status).toBe(to ?? from);
  });
});

describe('Membership', () => {
  it('deve nascer PENDING, ativar com data de início e encerrar com data de fim', () => {
    const membership = Membership.register({
      id: 'v-1',
      memberId: 'm-1',
      congregationId: 'c-1',
      primary: true,
    });

    expect(membership.status).toBe('PENDING');

    expect(membership.activate(TODAY).ok).toBe(true);

    expect(membership.activate(TODAY).ok).toBe(false);

    expect(membership.deactivate('2026-12-01').ok).toBe(true);

    expect(membership.toSnapshot()).toMatchObject({
      status: 'INACTIVE',
      startedOn: TODAY,
      endedOn: '2026-12-01',
    });

    // Encerrado é histórico: não reabre nem encerra de novo.
    expect(membership.activate(TODAY).ok).toBe(false);

    expect(membership.deactivate(TODAY).ok).toBe(false);
  });

  it('deve encerrar um vínculo pendente sem data de início (cancelado)', () => {
    const membership = Membership.restore(membershipSnapshot());

    expect(membership.deactivate(TODAY).ok).toBe(true);

    expect(membership.toSnapshot()).toMatchObject({ startedOn: null, endedOn: TODAY });
  });
});
