import type {
  Congregation,
  CongregationSnapshot,
  CongregationStatus,
} from '../domain/congregation.js';
import type { Organization } from '../domain/organization.js';

// As Ports são classes abstratas para servirem também de token de injeção na composição.

export abstract class OrganizationRepository {
  abstract findMain(): Promise<Organization | null>;

  // Controle otimista: grava somente se a versão persistida ainda for a do Aggregate carregado.
  // Retorna a nova versão, ou null quando outra escrita venceu.
  abstract update(organization: Organization): Promise<number | null>;
}

export interface CongregationListQuery {
  status: CongregationStatus | null;
  // Cursor: ID (UUIDv7, ordenável por criação) do último item da página anterior.
  after: string | null;
  limit: number;
}

export abstract class CongregationRepository {
  abstract findById(id: string): Promise<Congregation | null>;

  abstract list(query: CongregationListQuery): Promise<CongregationSnapshot[]>;

  // O código institucional é único; a restrição do banco decide entre registros simultâneos.
  abstract insert(congregation: Congregation): Promise<'inserted' | 'code_taken'>;

  abstract update(congregation: Congregation): Promise<number | null>;
}

export abstract class IdGenerator {
  abstract next(): string;
}
