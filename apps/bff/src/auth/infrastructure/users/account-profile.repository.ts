import { Inject, Injectable } from '@nestjs/common';
import { eq, sql } from 'drizzle-orm';
import { DatabaseService } from '../../../shared/infrastructure/database/database.service.js';
import { users } from '../database/auth.schema.js';
import type { Database } from '../../../shared/infrastructure/database/database.js';

export interface AccountSubscriptions {
  // Receber notícias da comunidade por e-mail.
  news: boolean;
}

export interface AccountCredentials {
  email: string;
  name: string;
  passwordHash: string;
}

// Dados da conta usados pelo Perfil: o vínculo com a Pessoa, o nome e o telefone exibidos fora do
// Perfil (cabeçalho, sessão) e as preferências de comunicação, que são da conta.
@Injectable()
export class AccountProfileRepository {
  private readonly db: Database;

  constructor(@Inject(DatabaseService) databaseService: DatabaseService) {
    this.db = databaseService.db;
  }

  async findPersonId(userId: string): Promise<string | null> {
    const [account] = await this.db
      .select({ personId: users.personId })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    return account?.personId ?? null;
  }

  async findCredentials(userId: string): Promise<AccountCredentials | null> {
    const [account] = await this.db
      .select({ email: users.email, name: users.name, passwordHash: users.passwordHash })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    return account ?? null;
  }

  // A Pessoa é dona do nome e do telefone; a conta guarda uma cópia para a sessão e o cabeçalho.
  async syncContact(userId: string, { name, phone }: { name: string; phone: string | null }) {
    await this.db
      .update(users)
      .set({ name, phone, updatedAt: sql`now()` })
      .where(eq(users.id, userId));
  }

  async changePassword(userId: string, passwordHash: string): Promise<void> {
    await this.db
      .update(users)
      .set({ passwordHash, updatedAt: sql`now()` })
      .where(eq(users.id, userId));
  }

  async getSubscriptions(userId: string): Promise<AccountSubscriptions> {
    const [account] = await this.db
      .select({ news: users.newsOptIn })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    return { news: account?.news ?? false };
  }

  async setSubscriptions(userId: string, { news }: AccountSubscriptions): Promise<void> {
    await this.db
      .update(users)
      .set({ newsOptIn: news, newsOptInUpdatedAt: sql`now()`, updatedAt: sql`now()` })
      .where(eq(users.id, userId));
  }
}
