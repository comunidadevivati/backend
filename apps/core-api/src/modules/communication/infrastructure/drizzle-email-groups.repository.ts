import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq, sql } from 'drizzle-orm';
import { isUniqueViolation } from '../../../shared/infrastructure/database/database-errors.js';
import { DatabaseService } from '../../../shared/infrastructure/database/database.service.js';
import { uuidv7 } from '../../../shared/infrastructure/id/uuid-v7.js';
import { EmailGroupRepository, IdGenerator } from '../application/ports.js';
import { EmailGroup, type EmailGroupSnapshot } from '../domain/email-group.js';
import { emailGroups } from './database/communication.schema.js';
import type { Database } from '../../../shared/infrastructure/database/database.js';

// Os registros Drizzle não saem desta camada: são convertidos em snapshots do Domain.

type EmailGroupRow = typeof emailGroups.$inferSelect;

const toSnapshot = (row: EmailGroupRow): EmailGroupSnapshot => ({
  id: row.id,
  name: row.name,
  description: row.description,
  memberAccountIds: row.memberAccountIds,
  version: row.version,
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
});

@Injectable()
export class DrizzleEmailGroupRepository extends EmailGroupRepository {
  private readonly db: Database;

  constructor(@Inject(DatabaseService) databaseService: DatabaseService) {
    super();

    this.db = databaseService.db;
  }

  async findById(id: string): Promise<EmailGroup | null> {
    const [row] = await this.db.select().from(emailGroups).where(eq(emailGroups.id, id)).limit(1);

    return row ? EmailGroup.restore(toSnapshot(row)) : null;
  }

  async list(): Promise<EmailGroupSnapshot[]> {
    const rows = await this.db
      .select()
      .from(emailGroups)
      .orderBy(asc(sql`lower(${emailGroups.name})`));

    return rows.map((row) => toSnapshot(row));
  }

  async insert(group: EmailGroup): Promise<'inserted' | 'name_taken'> {
    const { description, id, memberAccountIds, name } = group.toSnapshot();

    try {
      await this.db.insert(emailGroups).values({ id, name, description, memberAccountIds });
    } catch (error) {
      if (isUniqueViolation(error)) {
        return 'name_taken';
      }

      throw error;
    }

    return 'inserted';
  }

  async update(group: EmailGroup): Promise<EmailGroupSnapshot | 'name_taken' | null> {
    const { description, id, memberAccountIds, name, version } = group.toSnapshot();

    try {
      const [row] = await this.db
        .update(emailGroups)
        .set({
          name,
          description,
          memberAccountIds,
          version: sql`${emailGroups.version} + 1`,
          updatedAt: sql`now()`,
        })
        .where(and(eq(emailGroups.id, id), eq(emailGroups.version, version)))
        .returning();

      return row ? toSnapshot(row) : null;
    } catch (error) {
      if (isUniqueViolation(error)) {
        return 'name_taken';
      }

      throw error;
    }
  }

  async delete(id: string): Promise<boolean> {
    const rows = await this.db
      .delete(emailGroups)
      .where(eq(emailGroups.id, id))
      .returning({ id: emailGroups.id });

    return rows.length > 0;
  }
}

export class UuidV7IdGenerator extends IdGenerator {
  next(): string {
    return uuidv7();
  }
}
