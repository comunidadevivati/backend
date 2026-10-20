import { Inject, Injectable } from '@nestjs/common';
import { inArray } from 'drizzle-orm';
import { DatabaseService } from '../../../shared/infrastructure/database/database.service.js';
import {
  CongregationDirectory,
  type CongregationSummary,
} from '../public/congregation-directory.js';
import { congregations } from './database/organization.schema.js';
import type { Database } from '../../../shared/infrastructure/database/database.js';

// Implementação do contrato público: leitura somente dos campos expostos a outros contextos.
@Injectable()
export class DrizzleCongregationDirectory extends CongregationDirectory {
  private readonly db: Database;

  constructor(@Inject(DatabaseService) databaseService: DatabaseService) {
    super();

    this.db = databaseService.db;
  }

  async findById(id: string): Promise<CongregationSummary | null> {
    const [summary] = await this.findByIds([id]);

    return summary ?? null;
  }

  async findByIds(ids: readonly string[]): Promise<CongregationSummary[]> {
    if (ids.length === 0) {
      return [];
    }

    return this.db
      .select({
        id: congregations.id,
        code: congregations.code,
        name: congregations.name,
        status: congregations.status,
      })
      .from(congregations)
      .where(inArray(congregations.id, [...ids]));
  }
}
