import { createHash, randomBytes } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { and, eq, gt, isNull, lte, sql } from 'drizzle-orm';
import { DatabaseService } from '../../../shared/infrastructure/database/database.service.js';
import { uuidv7 } from '../../../shared/infrastructure/id/uuid-v7.js';
import { emailVerificationTokens, users } from '../database/auth.schema.js';
import type { Database } from '../../../shared/infrastructure/database/database.js';

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/u;

const hashToken = (token: string): string => createHash('sha256').update(token).digest('base64url');

export type IssueEmailVerificationResult =
  | { status: 'issued'; id: string; token: string; ttlHours: number }
  | { status: 'already_verified' }
  | { status: 'cooldown' };

@Injectable()
export class EmailVerificationTokenRepository {
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

  async issueForUser(userId: string): Promise<IssueEmailVerificationResult> {
    const id = uuidv7();

    const token = randomBytes(32).toString('base64url');

    const status = await this.db.transaction(async (transaction) => {
      // Serializa solicitações concorrentes da mesma conta para que o cooldown seja efetivo.
      const [user] = await transaction
        .select({ emailVerifiedAt: users.emailVerifiedAt })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1)
        .for('update');

      if (user?.emailVerifiedAt) {
        return 'already_verified' as const;
      }

      // Limpeza oportunista enquanto não existe worker contínuo.
      await transaction
        .delete(emailVerificationTokens)
        .where(lte(emailVerificationTokens.expiresAt, sql`now()`));

      const [recentToken] = await transaction
        .select({ id: emailVerificationTokens.id })
        .from(emailVerificationTokens)
        .where(
          and(
            eq(emailVerificationTokens.userId, userId),
            gt(
              emailVerificationTokens.createdAt,
              sql`now() - make_interval(secs => ${this.cooldownSeconds})`,
            ),
          ),
        )
        .limit(1);

      if (recentToken) {
        return 'cooldown' as const;
      }

      // Um novo envio invalida os links anteriores do usuário.
      await transaction
        .update(emailVerificationTokens)
        .set({ usedAt: sql`now()` })
        .where(
          and(eq(emailVerificationTokens.userId, userId), isNull(emailVerificationTokens.usedAt)),
        );

      await transaction.insert(emailVerificationTokens).values({
        id,
        tokenHash: hashToken(token),
        userId,
        expiresAt: sql`now() + make_interval(hours => ${this.ttlHours})`,
      });

      return 'issued' as const;
    });

    return status === 'issued' ? { status, id, token, ttlHours: this.ttlHours } : { status };
  }

  // Consome o token e marca o e-mail como verificado. Retorna false para token inválido, expirado,
  // já usado ou de conta suspensa.
  verify(token: string): Promise<boolean> {
    if (!TOKEN_PATTERN.test(token)) {
      return Promise.resolve(false);
    }

    return this.db.transaction(async (transaction) => {
      const [verificationToken] = await transaction
        .select({ id: emailVerificationTokens.id, userId: emailVerificationTokens.userId })
        .from(emailVerificationTokens)
        .innerJoin(users, eq(users.id, emailVerificationTokens.userId))
        .where(
          and(
            eq(emailVerificationTokens.tokenHash, hashToken(token)),
            isNull(emailVerificationTokens.usedAt),
            gt(emailVerificationTokens.expiresAt, sql`now()`),
            eq(users.status, 'ACTIVE'),
          ),
        )
        .limit(1)
        .for('update');

      if (!verificationToken) {
        return false;
      }

      await transaction
        .update(emailVerificationTokens)
        .set({ usedAt: sql`now()` })
        .where(eq(emailVerificationTokens.id, verificationToken.id));

      await transaction
        .update(users)
        .set({
          emailVerifiedAt: sql`coalesce(${users.emailVerifiedAt}, now())`,
          updatedAt: sql`now()`,
        })
        .where(eq(users.id, verificationToken.userId));

      return true;
    });
  }
}
