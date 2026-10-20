import { Inject, Injectable } from '@nestjs/common';
import { eq, sql } from 'drizzle-orm';
import { DatabaseService } from '../../../shared/infrastructure/database/database.service.js';
import { users } from '../database/auth.schema.js';
import type { Database } from '../../../shared/infrastructure/database/database.js';

// Dados da conta levados para a Pessoa na conversão.
interface PersonSource {
  accountId: string;
  name: string;
  email: string;
  phone: string | null;
}

export type LinkPersonResult =
  | { status: 'linked'; personId: string }
  | { status: 'not_found' }
  | { status: 'unverified' }
  | { status: 'already_linked'; personId: string }
  | { status: 'rejected' };

// Cria a Pessoa (e o membro) em outro contexto e devolve o ID da Pessoa, ou null se recusado.
export type CreatePerson = (source: PersonSource) => Promise<string | null>;

// Vínculo conta → Pessoa (auth.users.person_id). Identity é dono do vínculo.
@Injectable()
export class UserPersonLinkRepository {
  private readonly db: Database;

  constructor(@Inject(DatabaseService) databaseService: DatabaseService) {
    this.db = databaseService.db;
  }

  // Somente conta cadastrada e com e-mail verificado vira Pessoa. A linha da conta fica bloqueada
  // (FOR UPDATE) enquanto a Pessoa é criada: pedidos simultâneos para a mesma conta esperam e
  // encontram o vínculo já gravado. Se a gravação falhar depois da criação, repetir o pedido é
  // seguro: a Core API devolve a mesma Pessoa para a mesma conta.
  linkPerson(id: string, createPerson: CreatePerson): Promise<LinkPersonResult> {
    return this.db.transaction(async (transaction) => {
      const [account] = await transaction
        .select({
          name: users.name,
          email: users.email,
          phone: users.phone,
          emailVerifiedAt: users.emailVerifiedAt,
          personId: users.personId,
        })
        .from(users)
        .where(eq(users.id, id))
        .limit(1)
        .for('update');

      if (!account) {
        return { status: 'not_found' as const };
      }

      if (account.personId) {
        return { status: 'already_linked' as const, personId: account.personId };
      }

      if (!account.emailVerifiedAt) {
        return { status: 'unverified' as const };
      }

      const { email, name, phone } = account;

      const personId = await createPerson({ accountId: id, name, email, phone });

      if (!personId) {
        return { status: 'rejected' as const };
      }

      await transaction
        .update(users)
        .set({ personId, updatedAt: sql`now()` })
        .where(eq(users.id, id));

      return { status: 'linked' as const, personId };
    });
  }
}
