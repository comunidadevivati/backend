import type { EmailGroup, EmailGroupSnapshot } from '../domain/email-group.js';

// As Ports são classes abstratas para servirem também de token de injeção na composição.

export abstract class EmailGroupRepository {
  abstract findById(id: string): Promise<EmailGroup | null>;

  // Em ordem alfabética do nome.
  abstract list(): Promise<EmailGroupSnapshot[]>;

  // Restrição do banco: nome único, sem diferenciar maiúsculas ("name_taken").
  abstract insert(group: EmailGroup): Promise<'inserted' | 'name_taken'>;

  // Controle otimista: grava somente se a versão persistida ainda for a do Aggregate carregado.
  abstract update(group: EmailGroup): Promise<EmailGroupSnapshot | 'name_taken' | null>;

  abstract delete(id: string): Promise<boolean>;
}

export abstract class IdGenerator {
  abstract next(): string;
}
