import type { BacklogCard, BacklogCardSnapshot } from '../domain/backlog-card.js';

// As Ports são classes abstratas para servirem também de token de injeção na composição.

export abstract class BacklogCardRepository {
  abstract findById(id: string): Promise<BacklogCard | null>;

  // Do mais antigo para o mais novo.
  abstract list(): Promise<BacklogCardSnapshot[]>;

  abstract insert(card: BacklogCard): Promise<void>;

  // Controle otimista: grava somente se a versão persistida ainda for a do Aggregate carregado.
  abstract update(card: BacklogCard): Promise<BacklogCardSnapshot | null>;

  abstract delete(id: string): Promise<boolean>;
}

export abstract class IdGenerator {
  abstract next(): string;
}
