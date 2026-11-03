// Contrato público do contexto Communication para os demais contextos (ex.: Forms). É o único
// ponto de Communication que outro contexto pode importar; não expõe Aggregates nem Repositories.

// Destinatários de um conjunto de grupos, sem repetição.
export interface EmailGroupRecipients {
  // Contas do BFF (auth.users).
  accountIds: string[];
  // E-mails avulsos (pessoas sem conta), em minúsculas.
  emails: string[];
}

// Classe abstrata para servir também de token de injeção (exportada pelo CommunicationPublicModule).
export abstract class EmailGroupDirectory {
  // IDs informados que correspondem a grupos existentes; os demais ficam de fora.
  abstract existingIds(ids: readonly string[]): Promise<string[]>;

  // Destinatários dos grupos informados; grupos inexistentes são ignorados.
  abstract recipients(groupIds: readonly string[]): Promise<EmailGroupRecipients>;
}
