import { createHash, randomBytes } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { and, eq, gt, lte, sql } from 'drizzle-orm';
import { DatabaseService } from '../../../shared/infrastructure/database/database.service.js';
import { sessions, users } from '../database/auth.schema.js';
import type { Database } from '../../../shared/infrastructure/database/database.js';

export interface AuthSession {
  userId: string;
  email: string;
  name: string;
  emailVerified: boolean;
  csrfToken: string;
}

export interface CreatedSession {
  token: string;
  csrfToken: string;
}

// Expira após 30 minutos sem uso, renovando a cada acesso, e nunca dura mais que 12 horas.
const SESSION_IDLE_TIMEOUT_SECONDS = 30 * 60;

export const SESSION_ABSOLUTE_TIMEOUT_SECONDS = 12 * 60 * 60;

const SESSION_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/u;

const hashToken = (token: string): string => createHash('sha256').update(token).digest('base64url');

const idleExpiration = sql`least(
  now() + make_interval(secs => ${SESSION_IDLE_TIMEOUT_SECONDS}),
  ${sessions.createdAt} + make_interval(secs => ${SESSION_ABSOLUTE_TIMEOUT_SECONDS})
)`;

@Injectable()
export class SessionService {
  private readonly db: Database;

  constructor(@Inject(DatabaseService) databaseService: DatabaseService) {
    this.db = databaseService.db;
  }

  async createSession(userId: string): Promise<CreatedSession> {
    const token = randomBytes(32).toString('base64url');

    const csrfToken = randomBytes(32).toString('base64url');

    // Limpeza oportunista: sem Worker contínuo, sessões vencidas são removidas a cada login.
    await this.db.delete(sessions).where(lte(sessions.expiresAt, sql`now()`));

    await this.db.insert(sessions).values({
      tokenHash: hashToken(token),
      userId,
      csrfToken,
      expiresAt: sql`now() + make_interval(secs => ${SESSION_IDLE_TIMEOUT_SECONDS})`,
    });

    return { token, csrfToken };
  }

  // Retorna a sessão válida de um usuário ativo e renova sua expiração por inatividade.
  async getSession(token: string): Promise<AuthSession | null> {
    if (!SESSION_TOKEN_PATTERN.test(token)) {
      return null;
    }

    const [session] = await this.db
      .update(sessions)
      .set({ lastSeenAt: sql`now()`, expiresAt: idleExpiration })
      .from(users)
      .where(
        and(
          eq(sessions.tokenHash, hashToken(token)),
          gt(sessions.expiresAt, sql`now()`),
          eq(users.id, sessions.userId),
          eq(users.status, 'ACTIVE'),
        ),
      )
      .returning({
        userId: users.id,
        email: users.email,
        name: users.name,
        emailVerified: sql<boolean>`${users.emailVerifiedAt} is not null`,
        csrfToken: sessions.csrfToken,
      });

    return session ?? null;
  }

  async deleteSession(token: string): Promise<void> {
    if (!SESSION_TOKEN_PATTERN.test(token)) {
      return;
    }

    await this.db.delete(sessions).where(eq(sessions.tokenHash, hashToken(token)));
  }
}
