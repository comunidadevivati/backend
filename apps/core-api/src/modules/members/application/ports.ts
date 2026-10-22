import type { Member, MemberStatus } from '../domain/member.js';
import type { Membership, MembershipSnapshot } from '../domain/membership.js';
import type { Person, PersonSnapshot } from '../domain/person.js';

// As Ports são classes abstratas para servirem também de token de injeção na composição.

// Membro como exposto pela API (leitura): situação do membro com os dados pessoais da Pessoa.
export interface MemberView {
  id: string;
  status: MemberStatus;
  version: number;
  person: {
    id: string;
    fullName: string;
    birthDate: string | null;
    phone: string | null;
    email: string | null;
  };
}

export interface MemberListQuery {
  status: MemberStatus | null;
  // Somente membros com vínculo PENDING ou ACTIVE nesta congregação.
  congregationId: string | null;
  // Trecho do nome da Pessoa, sem diferenciar maiúsculas de minúsculas.
  search: string | null;
  // Cursor: ID (UUIDv7, ordenável por criação) do último item da página anterior.
  after: string | null;
  limit: number;
}

export abstract class MemberRepository {
  abstract findById(id: string): Promise<Member | null>;

  // Grava a Pessoa e o seu Membro na mesma transação. Restrição do banco: uma Pessoa por conta
  // ("account_taken" quando outra gravação para a mesma conta venceu).
  abstract enroll(person: Person, member: Member): Promise<'enrolled' | 'account_taken'>;

  // Controle otimista: grava somente se a versão persistida ainda for a do Aggregate carregado.
  // Retorna a nova versão, ou null quando outra escrita venceu.
  abstract update(member: Member): Promise<number | null>;
}

// Leitura (CQRS seletivo): membros com os dados da Pessoa.
export abstract class MemberQueries {
  abstract findById(id: string): Promise<MemberView | null>;

  // Membro da Pessoa originada pela conta, se houver.
  abstract findByAccountId(accountId: string): Promise<MemberView | null>;

  abstract list(query: MemberListQuery): Promise<MemberView[]>;
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

// Cadastro da Pessoa como exposto no Perfil: os dados gravados, sem a chave interna da foto, que vira
// uma URL de leitura de validade curta.
export type PersonView = Omit<PersonSnapshot, 'accountId' | 'avatarKey'> & {
  avatarUrl: string | null;
};

export abstract class PersonRepository {
  abstract findById(id: string): Promise<Person | null>;

  // Controle otimista: grava somente se a versão persistida ainda for a do Aggregate carregado.
  // Retorna a nova versão, ou null quando outra escrita venceu.
  abstract update(person: Person): Promise<number | null>;
}

// Fotos de perfil no bucket de mídia (área privada): o navegador envia direto ao bucket por URL
// pré-assinada e a Core API processa o arquivo enviado.
export abstract class AvatarStorage {
  // false quando MEDIA_STORAGE=disabled.
  abstract readonly enabled: boolean;

  abstract presignUpload(
    key: string,
    contentType: string,
    expiresInSeconds: number,
  ): Promise<string>;

  abstract presignDownload(key: string, expiresInSeconds: number): Promise<string>;

  abstract size(key: string): Promise<number | null>;

  abstract read(key: string): Promise<Uint8Array | null>;

  abstract write(key: string, body: Uint8Array, contentType: string): Promise<void>;

  abstract delete(keys: readonly string[]): Promise<void>;
}

export abstract class AvatarProcessor {
  // Foto quadrada em WebP, sem metadados; null quando o conteúdo não é uma imagem aceita.
  abstract process(input: Uint8Array): Promise<Uint8Array | null>;
}

export abstract class IdGenerator {
  abstract next(): string;
}

// Data civil atual (AAAA-MM-DD) no fuso da comunidade.
export abstract class Clock {
  abstract today(): string;
}
