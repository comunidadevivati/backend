import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { DatabaseService } from '../../../shared/infrastructure/database/database.service.js';
import { uuidv7 } from '../../../shared/infrastructure/id/uuid-v7.js';
import { users } from '../database/auth.schema.js';
import type { Database } from '../../../shared/infrastructure/database/database.js';

export interface UserCredentials {
  id: string;
  email: string;
  name: string;
  passwordHash: string;
  status: 'ACTIVE' | 'SUSPENDED';
}

export interface NewUser {
  email: string;
  name: string;
  passwordHash: string;
  phone?: string;
}

export const normalizeEmail = (email: string): string => email.trim().toLowerCase();

@Injectable()
export class UserRepository {
  private readonly db: Database;

  constructor(@Inject(DatabaseService) databaseService: DatabaseService) {
    this.db = databaseService.db;
  }

  async findByEmail(email: string): Promise<UserCredentials | null> {
    const [user] = await this.db
      .select({
        id: users.id,
        email: users.email,
        name: users.name,
        passwordHash: users.passwordHash,
        status: users.status,
      })
      .from(users)
      .where(eq(users.email, normalizeEmail(email)))
      .limit(1);

    return user ?? null;
  }

  async existsByEmail(email: string): Promise<boolean> {
    const [user] = await this.db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, normalizeEmail(email)))
      .limit(1);

    return Boolean(user);
  }

  create(user: NewUser): Promise<string> {
    return insertUser(this.db, user);
  }
}

// Também usado pelo CLI de criação de usuários, fora do contêiner de injeção do NestJS.
export const insertUser = async (db: Database, user: NewUser): Promise<string> => {
  const id = uuidv7();

  await db.insert(users).values({
    id,
    email: normalizeEmail(user.email),
    name: user.name.trim(),
    passwordHash: user.passwordHash,
    ...(user.phone ? { phone: user.phone } : {}),
  });

  return id;
};
