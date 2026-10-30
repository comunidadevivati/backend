// Contrato público do contexto Communication para os demais contextos (ex.: Forms). É o único
// ponto de Communication que outro contexto pode importar; não expõe Aggregates nem Repositories.

// Classe abstrata para servir também de token de injeção (exportada pelo CommunicationPublicModule).
export abstract class EmailGroupDirectory {
  // IDs informados que correspondem a grupos existentes; os demais ficam de fora.
  abstract existingIds(ids: readonly string[]): Promise<string[]>;

  // Contas (BFF) dos grupos informados, sem repetição; grupos inexistentes são ignorados.
  abstract memberAccountIds(groupIds: readonly string[]): Promise<string[]>;
}
