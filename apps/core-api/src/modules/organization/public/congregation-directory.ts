// Contrato público do contexto Organization para os demais contextos (ex.: Members). É o único
// arquivo de Organization que outro contexto pode importar; não expõe Aggregates nem Repositories.

export interface CongregationSummary {
  id: string;
  code: string;
  name: string;
  status: 'DRAFT' | 'ACTIVE' | 'INACTIVE';
}

// Classe abstrata para servir também de token de injeção (exportada pelo OrganizationPublicModule).
export abstract class CongregationDirectory {
  abstract findById(id: string): Promise<CongregationSummary | null>;

  // Resumos das congregações informadas; IDs inexistentes ficam de fora.
  abstract findByIds(ids: readonly string[]): Promise<CongregationSummary[]>;
}
