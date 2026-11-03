import { Inject, Injectable } from '@nestjs/common';
import { inArray } from 'drizzle-orm';
import { DatabaseService } from '../../../shared/infrastructure/database/database.service.js';
import { EmailGroupDirectory, type EmailGroupRecipients } from '../public/email-group-directory.js';
import { emailGroups } from './database/communication.schema.js';
import type { Database } from '../../../shared/infrastructure/database/database.js';

// Implementação do contrato público, lendo somente o schema do próprio contexto.
@Injectable()
export class DrizzleEmailGroupDirectory extends EmailGroupDirectory {
  private readonly db: Database;

  constructor(@Inject(DatabaseService) databaseService: DatabaseService) {
    super();

    this.db = databaseService.db;
  }

  async existingIds(ids: readonly string[]): Promise<string[]> {
    if (ids.length === 0) {
      return [];
    }

    const rows = await this.db
      .select({ id: emailGroups.id })
      .from(emailGroups)
      .where(inArray(emailGroups.id, [...ids]));

    return rows.map(({ id }) => id);
  }

  async recipients(groupIds: readonly string[]): Promise<EmailGroupRecipients> {
    if (groupIds.length === 0) {
      return { accountIds: [], emails: [] };
    }

    const rows = await this.db
      .select({
        memberAccountIds: emailGroups.memberAccountIds,
        externalEmails: emailGroups.externalEmails,
      })
      .from(emailGroups)
      .where(inArray(emailGroups.id, [...groupIds]));

    return {
      accountIds: [...new Set(rows.flatMap(({ memberAccountIds }) => memberAccountIds))],
      emails: [...new Set(rows.flatMap(({ externalEmails }) => externalEmails))],
    };
  }
}
