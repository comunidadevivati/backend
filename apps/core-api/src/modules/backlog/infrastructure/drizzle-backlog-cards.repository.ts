import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq, sql } from 'drizzle-orm';
import { DatabaseService } from '../../../shared/infrastructure/database/database.service.js';
import { uuidv7 } from '../../../shared/infrastructure/id/uuid-v7.js';
import { BacklogCardRepository, IdGenerator } from '../application/ports.js';
import { BacklogCard, type BacklogCardSnapshot } from '../domain/backlog-card.js';
import { backlogCards } from './database/backlog.schema.js';
import type { Database } from '../../../shared/infrastructure/database/database.js';

// Os registros Drizzle não saem desta camada: são convertidos em snapshots do Domain.

type BacklogCardRow = typeof backlogCards.$inferSelect;

const toSnapshot = (row: BacklogCardRow): BacklogCardSnapshot => ({
  id: row.id,
  title: row.title,
  description: row.description,
  type: row.type,
  status: row.status,
  version: row.version,
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
  statusChangedAt: row.statusChangedAt.toISOString(),
});

@Injectable()
export class DrizzleBacklogCardRepository extends BacklogCardRepository {
  private readonly db: Database;

  constructor(@Inject(DatabaseService) databaseService: DatabaseService) {
    super();

    this.db = databaseService.db;
  }

  async findById(id: string): Promise<BacklogCard | null> {
    const [row] = await this.db.select().from(backlogCards).where(eq(backlogCards.id, id)).limit(1);

    return row ? BacklogCard.restore(toSnapshot(row)) : null;
  }

  async list(): Promise<BacklogCardSnapshot[]> {
    const rows = await this.db.select().from(backlogCards).orderBy(asc(backlogCards.createdAt));

    return rows.map((row) => toSnapshot(row));
  }

  async insert(card: BacklogCard): Promise<void> {
    const { createdAt, statusChangedAt, updatedAt, ...values } = card.toSnapshot();

    await this.db.insert(backlogCards).values({
      ...values,
      createdAt: new Date(createdAt),
      updatedAt: new Date(updatedAt),
      statusChangedAt: new Date(statusChangedAt),
    });
  }

  async update(card: BacklogCard): Promise<BacklogCardSnapshot | null> {
    const { description, id, status, statusChangedAt, title, type, updatedAt, version } =
      card.toSnapshot();

    const [row] = await this.db
      .update(backlogCards)
      .set({
        title,
        description,
        type,
        status,
        version: sql`${backlogCards.version} + 1`,
        updatedAt: new Date(updatedAt),
        statusChangedAt: new Date(statusChangedAt),
      })
      .where(and(eq(backlogCards.id, id), eq(backlogCards.version, version)))
      .returning();

    return row ? toSnapshot(row) : null;
  }

  async delete(id: string): Promise<boolean> {
    const rows = await this.db
      .delete(backlogCards)
      .where(eq(backlogCards.id, id))
      .returning({ id: backlogCards.id });

    return rows.length > 0;
  }
}

export class UuidV7IdGenerator extends IdGenerator {
  next(): string {
    return uuidv7();
  }
}
