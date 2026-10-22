import { createHash, randomBytes } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { and, eq, gt, isNull, lte, ne, sql } from 'drizzle-orm';
import { isUniqueViolation } from '../../../shared/infrastructure/database/database-errors.js';
import { DatabaseService } from '../../../shared/infrastructure/database/database.service.js';
import { uuidv7 } from '../../../shared/infrastructure/id/uuid-v7.js';
import { emailChangeTokens, users } from '../database/auth.schema.js';
import type { Database } from '../../../shared/infrastructure/database/database.js';

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/u;

const hashToken = (token: string): string => createHash('sha256').update(token).digest('base64url');

export type IssueEmailChangeResult =
  | { status: 'issued'; id: string; token: string; ttlHours: number }
  | { status: 'cooldown' };

export type ConfirmEmailChangeResult =
  | { status: 'changed'; id: string; name: string; previousEmail: string; newEmail: string }
  | { status: 'invalid_token' }
  | { status: 'email_taken' };

// Acompanha a troca na Pessoa (Core API); uma falha desfaz a troca na conta.
export type SyncPersonEmail = (personId: string, email: string) => Promise<void>;

class EmailTakenError extends Error {}

// Links de troca do e-mail de acesso. Mesmo prazo e intervalo mínimo entre envios da verificação de
// e-mail (EMAIL_VERIFICATION_TTL_HOURS e EMAIL_VERIFICATION_COOLDOWN_SECONDS).
@Injectable()
export class EmailChangeTokenRepository {
  private readonly db: Database;

  private readonly ttlHours: number;

  private readonly cooldownSeconds: number;

  constructor(
    @Inject(DatabaseService) databaseService: DatabaseService,
    @Inject(ConfigService) configService: ConfigService,
  ) {
    this.db = databaseService.db;

    this.ttlHours = configService.getOrThrow<number>('EMAIL_VERIFICATION_TTL_HOURS');

    this.cooldownSeconds = configService.getOrThrow<number>('EMAIL_VERIFICATION_COOLDOWN_SECONDS');
  }

  async issue(userId: string, newEmail: string): Promise<IssueEmailChangeResult> {
    const id = uuidv7();

    const token = randomBytes(32).toString('base64url');

    const status = await this.db.transaction(async (transaction) => {
      // Serializa pedidos concorrentes da mesma conta para que o intervalo mínimo seja efetivo.
      await transaction
        .select({ id: users.id })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1)
        .for('update');

      // Limpeza oportunista enquanto não existe worker contínuo.
      await transaction
        .delete(emailChangeTokens)
        .where(lte(emailChangeTokens.expiresAt, sql`now()`));

      const [recentToken] = await transaction
        .select({ id: emailChangeTokens.id })
        .from(emailChangeTokens)
        .where(
          and(
            eq(emailChangeTokens.userId, userId),
            gt(
              emailChangeTokens.createdAt,
              sql`now() - make_interval(secs => ${this.cooldownSeconds})`,
            ),
          ),
        )
        .limit(1);

      if (recentToken) {
        return 'cooldown' as const;
      }

      // Um novo pedido invalida os links anteriores da conta.
      await transaction
        .update(emailChangeTokens)
        .set({ usedAt: sql`now()` })
        .where(and(eq(emailChangeTokens.userId, userId), isNull(emailChangeTokens.usedAt)));

      await transaction.insert(emailChangeTokens).values({
        id,
        tokenHash: hashToken(token),
        userId,
        newEmail,
        expiresAt: sql`now() + make_interval(hours => ${this.ttlHours})`,
      });

      return 'issued' as const;
    });

    return status === 'issued' ? { status, id, token, ttlHours: this.ttlHours } : { status };
  }

  // Consome o link e troca o e-mail de acesso, já verificado (o link chegou ao novo endereço). A
  // Pessoa acompanha a troca na mesma transação: se a Core API falhar, nada muda e o link continua
  // válido para nova tentativa.
  async confirm(token: string, syncPerson: SyncPersonEmail): Promise<ConfirmEmailChangeResult> {
    if (!TOKEN_PATTERN.test(token)) {
      return { status: 'invalid_token' };
    }

    try {
      return await this.db.transaction(async (transaction) => {
        const [change] = await transaction
          .select({
            id: emailChangeTokens.id,
            userId: emailChangeTokens.userId,
            newEmail: emailChangeTokens.newEmail,
            previousEmail: users.email,
            name: users.name,
            personId: users.personId,
          })
          .from(emailChangeTokens)
          .innerJoin(users, eq(users.id, emailChangeTokens.userId))
          .where(
            and(
              eq(emailChangeTokens.tokenHash, hashToken(token)),
              isNull(emailChangeTokens.usedAt),
              gt(emailChangeTokens.expiresAt, sql`now()`),
              eq(users.status, 'ACTIVE'),
            ),
          )
          .limit(1)
          .for('update');

        if (!change) {
          return { status: 'invalid_token' as const };
        }

        const [taken] = await transaction
          .select({ id: users.id })
          .from(users)
          .where(and(eq(users.email, change.newEmail), ne(users.id, change.userId)))
          .limit(1);

        if (taken) {
          throw new EmailTakenError();
        }

        await transaction
          .update(users)
          .set({
            email: change.newEmail,
            emailVerifiedAt: sql`now()`,
            updatedAt: sql`now()`,
          })
          .where(eq(users.id, change.userId));

        await transaction
          .update(emailChangeTokens)
          .set({ usedAt: sql`now()` })
          .where(
            and(eq(emailChangeTokens.userId, change.userId), isNull(emailChangeTokens.usedAt)),
          );

        if (change.personId) {
          await syncPerson(change.personId, change.newEmail);
        }

        return {
          status: 'changed' as const,
          id: change.id,
          name: change.name,
          previousEmail: change.previousEmail,
          newEmail: change.newEmail,
        };
      });
    } catch (error) {
      // Outra conta passou a usar o e-mail depois do pedido.
      if (error instanceof EmailTakenError || isUniqueViolation(error)) {
        return { status: 'email_taken' };
      }

      throw error;
    }
  }
}
