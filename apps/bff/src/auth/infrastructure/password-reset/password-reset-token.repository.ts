import { createHash, randomBytes } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { and, eq, gt, isNull, lte, sql } from 'drizzle-orm';
import { DatabaseService } from '../../../shared/infrastructure/database/database.service.js';
import { uuidv7 } from '../../../shared/infrastructure/id/uuid-v7.js';
import { passwordResetTokens, sessions, users } from '../database/auth.schema.js';
import type { Database } from '../../../shared/infrastructure/database/database.js';

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/u;

const hashToken = (token: string): string => createHash('sha256').update(token).digest('base64url');

export interface IssuedPasswordResetToken {
  id: string;
  token: string;
  ttlMinutes: number;
}

export interface PasswordResetUser {
  email: string;
  emailVerifiedAt: Date | null;
  id: string;
  name: string;
  passwordHash: string;
}

@Injectable()
export class PasswordResetTokenRepository {
  private readonly db: Database;

  private readonly ttlMinutes: number;

  private readonly cooldownSeconds: number;

  constructor(
    @Inject(DatabaseService) databaseService: DatabaseService,
    @Inject(ConfigService) configService: ConfigService,
  ) {
    this.db = databaseService.db;

    this.ttlMinutes = configService.getOrThrow<number>('PASSWORD_RESET_TTL_MINUTES');

    this.cooldownSeconds = configService.getOrThrow<number>('PASSWORD_RESET_COOLDOWN_SECONDS');
  }

  async issueForUser(userId: string): Promise<IssuedPasswordResetToken | null> {
    const id = uuidv7();

    const token = randomBytes(32).toString('base64url');

    const issued = await this.db.transaction(async (transaction) => {
      // Serializa solicitações concorrentes da mesma conta para que o cooldown seja efetivo.
      await transaction
        .select({ id: users.id })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1)
        .for('update');

      // Limpeza oportunista enquanto não existe worker contínuo.
      await transaction
        .delete(passwordResetTokens)
        .where(lte(passwordResetTokens.expiresAt, sql`now()`));

      const [recentToken] = await transaction
        .select({ id: passwordResetTokens.id })
        .from(passwordResetTokens)
        .where(
          and(
            eq(passwordResetTokens.userId, userId),
            gt(
              passwordResetTokens.createdAt,
              sql`now() - make_interval(secs => ${this.cooldownSeconds})`,
            ),
          ),
        )
        .limit(1);

      if (recentToken) {
        return false;
      }

      // Uma nova solicitação invalida todos os links anteriores do usuário.
      await transaction
        .update(passwordResetTokens)
        .set({ usedAt: sql`now()` })
        .where(and(eq(passwordResetTokens.userId, userId), isNull(passwordResetTokens.usedAt)));

      await transaction.insert(passwordResetTokens).values({
        id,
        tokenHash: hashToken(token),
        userId,
        expiresAt: sql`now() + make_interval(mins => ${this.ttlMinutes})`,
      });

      return true;
    });

    return issued ? { id, token, ttlMinutes: this.ttlMinutes } : null;
  }

  async findValidUser(token: string): Promise<PasswordResetUser | null> {
    if (!TOKEN_PATTERN.test(token)) {
      return null;
    }

    const [user] = await this.db
      .select({
        id: users.id,
        email: users.email,
        name: users.name,
        passwordHash: users.passwordHash,
        emailVerifiedAt: users.emailVerifiedAt,
      })
      .from(passwordResetTokens)
      .innerJoin(users, eq(users.id, passwordResetTokens.userId))
      .where(
        and(
          eq(passwordResetTokens.tokenHash, hashToken(token)),
          isNull(passwordResetTokens.usedAt),
          gt(passwordResetTokens.expiresAt, sql`now()`),
          eq(users.status, 'ACTIVE'),
        ),
      )
      .limit(1);

    return user ?? null;
  }

  consume(token: string, userId: string, passwordHash: string): Promise<boolean> {
    if (!TOKEN_PATTERN.test(token)) {
      return Promise.resolve(false);
    }

    return this.db.transaction(async (transaction) => {
      const [resetToken] = await transaction
        .select({ id: passwordResetTokens.id })
        .from(passwordResetTokens)
        .innerJoin(users, eq(users.id, passwordResetTokens.userId))
        .where(
          and(
            eq(passwordResetTokens.tokenHash, hashToken(token)),
            eq(passwordResetTokens.userId, userId),
            isNull(passwordResetTokens.usedAt),
            gt(passwordResetTokens.expiresAt, sql`now()`),
            eq(users.status, 'ACTIVE'),
          ),
        )
        .limit(1)
        .for('update');

      if (!resetToken) {
        return false;
      }

      await transaction
        .update(users)
        .set({ passwordHash, updatedAt: sql`now()` })
        .where(eq(users.id, userId));

      await transaction.delete(sessions).where(eq(sessions.userId, userId));

      await transaction
        .update(passwordResetTokens)
        .set({ usedAt: sql`now()` })
        .where(and(eq(passwordResetTokens.userId, userId), isNull(passwordResetTokens.usedAt)));

      return true;
    });
  }
}
