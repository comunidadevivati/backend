import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq, gt, ilike, isNotNull, isNull, or, sql, type SQL } from 'drizzle-orm';
import { isUniqueViolation } from '../../../shared/infrastructure/database/database-errors.js';
import { DatabaseService } from '../../../shared/infrastructure/database/database.service.js';
import {
  emailVerificationTokens,
  passwordResetTokens,
  sessions,
  users,
} from '../database/auth.schema.js';
import { normalizeEmail } from './user.repository.js';
import type { Database } from '../../../shared/infrastructure/database/database.js';
import type { PgColumn } from 'drizzle-orm/pg-core';

export type UserStatus = 'ACTIVE' | 'SUSPENDED';

// Conta como exposta na gestão de usuários: nunca inclui o hash da senha.
export interface UserAccount {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  status: UserStatus;
  emailVerified: boolean;
  createdAt: string;
  suspendedAt: string | null;
  // Pessoa gerada a partir da conta (na Core API, ao virar membro); nula enquanto não houver.
  personId: string | null;
}

export interface UserAccountListQuery {
  status: UserStatus | null;
  emailVerified: boolean | null;
  // true = somente contas que já viraram Pessoa (e membro); false = somente as que ainda não.
  hasPerson: boolean | null;
  // Trecho do nome ou do e-mail.
  search: string | null;
  // Cursor: ID (UUIDv7, ordenável por criação) do último item da página anterior.
  after: string | null;
  limit: number;
}

export interface UserAccountChanges {
  name?: string | undefined;
  phone?: string | undefined;
  email?: string | undefined;
}

export type UpdateUserAccountResult =
  | { status: 'updated'; account: UserAccount; emailChanged: boolean }
  | { status: 'not_found' }
  | { status: 'email_taken' };

export type DeleteUserAccountResult = 'deleted' | 'not_found' | 'verified';

// Data e hora em ISO 8601 (UTC); nulo continua nulo.
const isoUtc = <T extends string | null>(column: PgColumn) =>
  sql<T>`to_char(${column} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')`;

const accountColumns = {
  id: users.id,
  name: users.name,
  email: users.email,
  phone: users.phone,
  status: users.status,
  emailVerified: sql<boolean>`${users.emailVerifiedAt} is not null`,
  createdAt: isoUtc<string>(users.createdAt),
  suspendedAt: isoUtc<string | null>(users.suspendedAt),
  personId: users.personId,
};

// Curingas do ILIKE digitados pelo usuário são tratados como texto.
const escapeLike = (value: string): string => value.replaceAll(/[\\%_]/gu, (char) => `\\${char}`);

@Injectable()
export class UserAccountRepository {
  private readonly db: Database;

  constructor(@Inject(DatabaseService) databaseService: DatabaseService) {
    this.db = databaseService.db;
  }

  async list({
    after,
    emailVerified,
    hasPerson,
    limit,
    search,
    status,
  }: UserAccountListQuery): Promise<UserAccount[]> {
    const filters: SQL[] = [];

    if (status) {
      filters.push(eq(users.status, status));
    }

    if (emailVerified !== null) {
      filters.push(
        emailVerified ? isNotNull(users.emailVerifiedAt) : isNull(users.emailVerifiedAt),
      );
    }

    if (hasPerson !== null) {
      filters.push(hasPerson ? isNotNull(users.personId) : isNull(users.personId));
    }

    if (search) {
      const pattern = `%${escapeLike(search)}%`;

      const matches = or(ilike(users.name, pattern), ilike(users.email, pattern));

      if (matches) {
        filters.push(matches);
      }
    }

    if (after) {
      filters.push(gt(users.id, after));
    }

    return this.db
      .select(accountColumns)
      .from(users)
      .where(and(...filters))
      .orderBy(asc(users.id))
      .limit(limit);
  }

  async findById(id: string): Promise<UserAccount | null> {
    const [account] = await this.db
      .select(accountColumns)
      .from(users)
      .where(eq(users.id, id))
      .limit(1);

    return account ?? null;
  }

  // Trocar o e-mail volta a conta para "não verificada" e invalida os links de verificação e de
  // redefinição de senha enviados ao endereço anterior, na mesma transação.
  async update(id: string, changes: UserAccountChanges): Promise<UpdateUserAccountResult> {
    try {
      return await this.db.transaction(async (transaction) => {
        const [current] = await transaction
          .select({ email: users.email })
          .from(users)
          .where(eq(users.id, id))
          .limit(1)
          .for('update');

        if (!current) {
          return { status: 'not_found' as const };
        }

        const email = changes.email === undefined ? undefined : normalizeEmail(changes.email);

        const emailChanged = email !== undefined && email !== current.email;

        await transaction
          .update(users)
          .set({
            ...(changes.name === undefined ? {} : { name: changes.name.trim() }),
            ...(changes.phone === undefined ? {} : { phone: changes.phone }),
            ...(emailChanged ? { email, emailVerifiedAt: null } : {}),
            updatedAt: sql`now()`,
          })
          .where(eq(users.id, id));

        if (emailChanged) {
          // Apagar (e não só marcar como usados) libera o cooldown para o envio ao novo endereço.
          await transaction
            .delete(emailVerificationTokens)
            .where(eq(emailVerificationTokens.userId, id));

          await transaction
            .update(passwordResetTokens)
            .set({ usedAt: sql`now()` })
            .where(and(eq(passwordResetTokens.userId, id), isNull(passwordResetTokens.usedAt)));
        }

        const [account] = await transaction
          .select(accountColumns)
          .from(users)
          .where(eq(users.id, id))
          .limit(1);

        return account
          ? { status: 'updated' as const, account, emailChanged }
          : { status: 'not_found' as const };
      });
    } catch (error) {
      // A restrição UNIQUE do e-mail decide entre alterações simultâneas.
      if (isUniqueViolation(error)) {
        return { status: 'email_taken' };
      }

      throw error;
    }
  }

  // Suspender registra o momento e encerra todas as sessões abertas da conta; repetir a suspensão
  // preserva o momento original. Reativar apaga o momento.
  async setStatus(id: string, status: UserStatus): Promise<UserAccount | null> {
    return this.db.transaction(async (transaction) => {
      const [updated] = await transaction
        .update(users)
        .set({
          status,
          suspendedAt: status === 'SUSPENDED' ? sql`coalesce(${users.suspendedAt}, now())` : null,
          updatedAt: sql`now()`,
        })
        .where(eq(users.id, id))
        .returning({ id: users.id });

      if (!updated) {
        return null;
      }

      if (status === 'SUSPENDED') {
        await transaction.delete(sessions).where(eq(sessions.userId, id));
      }

      const [account] = await transaction
        .select(accountColumns)
        .from(users)
        .where(eq(users.id, id))
        .limit(1);

      return account ?? null;
    });
  }

  // Exclusão definitiva somente de contas que nunca verificaram o e-mail (cadastros abandonados).
  // Sessões e tokens são removidos em cascata.
  async deleteUnverified(id: string): Promise<DeleteUserAccountResult> {
    const [deleted] = await this.db
      .delete(users)
      .where(and(eq(users.id, id), isNull(users.emailVerifiedAt)))
      .returning({ id: users.id });

    if (deleted) {
      return 'deleted';
    }

    return (await this.findById(id)) ? 'verified' : 'not_found';
  }
}
