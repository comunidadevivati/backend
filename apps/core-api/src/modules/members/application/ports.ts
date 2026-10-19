import type { Member, MemberSnapshot, MemberStatus } from '../domain/member.js';
import type { Membership, MembershipSnapshot } from '../domain/membership.js';

// As Ports são classes abstratas para servirem também de token de injeção na composição.

export interface MemberListQuery {
  status: MemberStatus | null;
  // Somente membros com vínculo PENDING ou ACTIVE nesta congregação.
  congregationId: string | null;
  // Trecho do nome, sem diferenciar maiúsculas de minúsculas.
  search: string | null;
  // Cursor: ID (UUIDv7, ordenável por criação) do último item da página anterior.
  after: string | null;
  limit: number;
}

export abstract class MemberRepository {
  abstract findById(id: string): Promise<Member | null>;

  abstract list(query: MemberListQuery): Promise<MemberSnapshot[]>;

  abstract insert(member: Member): Promise<void>;

  // Controle otimista: grava somente se a versão persistida ainda for a do Aggregate carregado.
  // Retorna a nova versão, ou null quando outra escrita venceu.
  abstract update(member: Member): Promise<number | null>;
}

export abstract class MembershipRepository {
  abstract findById(id: string): Promise<Membership | null>;

  // Todos os vínculos do membro, inclusive os encerrados (histórico), do mais antigo ao mais novo.
  abstract listByMember(memberId: string): Promise<MembershipSnapshot[]>;

  // Existe vínculo PENDING ou ACTIVE do membro?
  abstract hasOpenMemberships(memberId: string): Promise<boolean>;

  // Restrição do banco: um único vínculo aberto (PENDING ou ACTIVE) por membro e congregação.
  abstract insert(membership: Membership): Promise<'inserted' | 'duplicate'>;

  // Restrição do banco: um único vínculo principal ACTIVE por membro ("primary_taken").
  abstract update(membership: Membership): Promise<number | null | 'primary_taken'>;
}

// Congregações do contexto Organization, vistas pelo contexto Members (Anticorruption Layer).
export interface CongregationRef {
  id: string;
  code: string;
  name: string;
  // Somente congregações ativas aceitam novos vínculos e ativações.
  active: boolean;
}

export abstract class CongregationCatalog {
  abstract findById(id: string): Promise<CongregationRef | null>;

  abstract findByIds(ids: readonly string[]): Promise<CongregationRef[]>;
}

export abstract class IdGenerator {
  abstract next(): string;
}

// Data civil atual (AAAA-MM-DD) no fuso da comunidade.
export abstract class Clock {
  abstract today(): string;
}
