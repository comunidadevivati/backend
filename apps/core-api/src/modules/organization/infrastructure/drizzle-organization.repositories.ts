import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq, gt, sql, type SQL } from 'drizzle-orm';
import { isUniqueViolation } from '../../../shared/infrastructure/database/database-errors.js';
import { DatabaseService } from '../../../shared/infrastructure/database/database.service.js';
import { uuidv7 } from '../../../shared/infrastructure/id/uuid-v7.js';
import {
  CongregationRepository,
  IdGenerator,
  OrganizationRepository,
  type CongregationListQuery,
} from '../application/ports.js';
import { Congregation, type CongregationSnapshot } from '../domain/congregation.js';
import { Organization } from '../domain/organization.js';
import { congregations, organizations } from './database/organization.schema.js';
import type { Database } from '../../../shared/infrastructure/database/database.js';
import type { PostalAddressProps } from '../domain/value-objects/postal-address.js';

// Os registros Drizzle não saem desta camada: são convertidos em snapshots do Domain.

type OrganizationRow = typeof organizations.$inferSelect;

type CongregationRow = typeof congregations.$inferSelect;

const toAddress = (row: OrganizationRow | CongregationRow): PostalAddressProps => ({
  street: row.street,
  number: row.number,
  complement: row.complement,
  district: row.district,
  city: row.city,
  state: row.state,
  postalCode: row.postalCode,
});

const toCongregationSnapshot = (row: CongregationRow): CongregationSnapshot => ({
  id: row.id,
  organizationId: row.organizationId,
  code: row.code,
  name: row.name,
  cnpj: row.cnpj,
  address: toAddress(row),
  phone: row.phone,
  email: row.email,
  headquarters: row.headquarters,
  status: row.status,
  version: row.version,
});

const nextVersion = {
  version: sql<number>`${sql.raw('version')} + 1`,
  updatedAt: sql`now()`,
};

@Injectable()
export class DrizzleOrganizationRepository extends OrganizationRepository {
  private readonly db: Database;

  constructor(@Inject(DatabaseService) databaseService: DatabaseService) {
    super();

    this.db = databaseService.db;
  }

  // A organização principal é única: a raiz criada pela migration inicial.
  async findMain(): Promise<Organization | null> {
    const [row] = await this.db
      .select()
      .from(organizations)
      .orderBy(asc(organizations.id))
      .limit(1);

    return row
      ? Organization.restore({
          id: row.id,
          legalName: row.legalName,
          tradeName: row.tradeName,
          cnpj: row.cnpj,
          address: toAddress(row),
          phone: row.phone,
          email: row.email,
          status: row.status,
          version: row.version,
        })
      : null;
  }

  async update(organization: Organization): Promise<number | null> {
    const { address, cnpj, email, id, legalName, phone, status, tradeName, version } =
      organization.toSnapshot();

    const [row] = await this.db
      .update(organizations)
      .set({ legalName, tradeName, cnpj, ...address, phone, email, status, ...nextVersion })
      .where(and(eq(organizations.id, id), eq(organizations.version, version)))
      .returning({ version: organizations.version });

    return row?.version ?? null;
  }
}

@Injectable()
export class DrizzleCongregationRepository extends CongregationRepository {
  private readonly db: Database;

  constructor(@Inject(DatabaseService) databaseService: DatabaseService) {
    super();

    this.db = databaseService.db;
  }

  async findById(id: string): Promise<Congregation | null> {
    const [row] = await this.db
      .select()
      .from(congregations)
      .where(eq(congregations.id, id))
      .limit(1);

    return row ? Congregation.restore(toCongregationSnapshot(row)) : null;
  }

  async list({ after, limit, status }: CongregationListQuery): Promise<CongregationSnapshot[]> {
    const filters: SQL[] = [];

    if (status) {
      filters.push(eq(congregations.status, status));
    }

    if (after) {
      filters.push(gt(congregations.id, after));
    }

    const rows = await this.db
      .select()
      .from(congregations)
      .where(and(...filters))
      .orderBy(asc(congregations.id))
      .limit(limit);

    return rows.map((row) => toCongregationSnapshot(row));
  }

  async insert(congregation: Congregation): Promise<'inserted' | 'code_taken'> {
    const { address, ...snapshot } = congregation.toSnapshot();

    try {
      await this.db.insert(congregations).values({ ...snapshot, ...address });
    } catch (error) {
      if (isUniqueViolation(error)) {
        return 'code_taken';
      }

      throw error;
    }

    return 'inserted';
  }

  async update(congregation: Congregation): Promise<number | null> {
    const { address, cnpj, email, id, name, phone, status, version } = congregation.toSnapshot();

    const [row] = await this.db
      .update(congregations)
      .set({ name, cnpj, ...address, phone, email, status, ...nextVersion })
      .where(and(eq(congregations.id, id), eq(congregations.version, version)))
      .returning({ version: congregations.version });

    return row?.version ?? null;
  }
}

@Injectable()
export class UuidV7IdGenerator extends IdGenerator {
  next(): string {
    return uuidv7();
  }
}
