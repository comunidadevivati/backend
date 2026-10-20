import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq, exists, gt, ilike, inArray, sql, type SQL } from 'drizzle-orm';
import { isUniqueViolation } from '../../../shared/infrastructure/database/database-errors.js';
import { DatabaseService } from '../../../shared/infrastructure/database/database.service.js';
import { uuidv7 } from '../../../shared/infrastructure/id/uuid-v7.js';
import {
  Clock,
  IdGenerator,
  MemberQueries,
  MemberRepository,
  MembershipRepository,
  type MemberListQuery,
  type MemberView,
} from '../application/ports.js';
import { Member, type MemberSnapshot } from '../domain/member.js';
import { Membership, type MembershipSnapshot } from '../domain/membership.js';
import { members, memberships, people } from './database/members.schema.js';
import type { Database } from '../../../shared/infrastructure/database/database.js';
import type { Person } from '../domain/person.js';

// Os registros Drizzle não saem desta camada: são convertidos em snapshots do Domain.

type MemberRow = typeof members.$inferSelect;

type MembershipRow = typeof memberships.$inferSelect;

const OPEN_STATUSES = ['PENDING', 'ACTIVE'] as const;

const toMemberSnapshot = (row: MemberRow): MemberSnapshot => ({
  id: row.id,
  personId: row.personId,
  status: row.status,
  version: row.version,
});

// Leitura: o membro com os dados pessoais da Pessoa.
const memberViewColumns = {
  id: members.id,
  status: members.status,
  version: members.version,
  personId: people.id,
  fullName: people.fullName,
  birthDate: people.birthDate,
  phone: people.phone,
  email: people.email,
};

interface MemberViewRow {
  id: string;
  status: MemberSnapshot['status'];
  version: number;
  personId: string;
  fullName: string;
  birthDate: string | null;
  phone: string | null;
  email: string | null;
}

const toMemberView = ({ personId, ...row }: MemberViewRow): MemberView => ({
  id: row.id,
  status: row.status,
  version: row.version,
  person: {
    id: personId,
    fullName: row.fullName,
    birthDate: row.birthDate,
    phone: row.phone,
    email: row.email,
  },
});

const toMembershipSnapshot = (row: MembershipRow): MembershipSnapshot => ({
  id: row.id,
  memberId: row.memberId,
  congregationId: row.congregationId,
  primary: row.primary,
  status: row.status,
  startedOn: row.startedOn,
  endedOn: row.endedOn,
  version: row.version,
});

const nextVersion = {
  version: sql<number>`${sql.raw('version')} + 1`,
  updatedAt: sql`now()`,
};

// Curingas do ILIKE digitados pelo usuário são tratados como texto.
const escapeLike = (value: string): string => value.replaceAll(/[\\%_]/gu, (char) => `\\${char}`);

@Injectable()
export class DrizzleMemberRepository extends MemberRepository {
  private readonly db: Database;

  constructor(@Inject(DatabaseService) databaseService: DatabaseService) {
    super();

    this.db = databaseService.db;
  }

  async findById(id: string): Promise<Member | null> {
    const [row] = await this.db.select().from(members).where(eq(members.id, id)).limit(1);

    return row ? Member.restore(toMemberSnapshot(row)) : null;
  }

  // Pessoa e membro na mesma transação. A restrição única de people.account_id decide entre pedidos
  // simultâneos para a mesma conta.
  async enroll(person: Person, member: Member): Promise<'enrolled' | 'account_taken'> {
    try {
      await this.db.transaction(async (transaction) => {
        await transaction.insert(people).values(person.toSnapshot());

        await transaction.insert(members).values(member.toSnapshot());
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        return 'account_taken';
      }

      throw error;
    }

    return 'enrolled';
  }

  async update(member: Member): Promise<number | null> {
    const { id, status, version } = member.toSnapshot();

    const [row] = await this.db
      .update(members)
      .set({ status, ...nextVersion })
      .where(and(eq(members.id, id), eq(members.version, version)))
      .returning({ version: members.version });

    return row?.version ?? null;
  }
}

@Injectable()
export class DrizzleMemberQueries extends MemberQueries {
  private readonly db: Database;

  constructor(@Inject(DatabaseService) databaseService: DatabaseService) {
    super();

    this.db = databaseService.db;
  }

  findById(id: string): Promise<MemberView | null> {
    return this.findOne(eq(members.id, id));
  }

  findByAccountId(accountId: string): Promise<MemberView | null> {
    return this.findOne(eq(people.accountId, accountId));
  }

  async list({
    after,
    congregationId,
    limit,
    search,
    status,
  }: MemberListQuery): Promise<MemberView[]> {
    const filters: SQL[] = [];

    if (status) {
      filters.push(eq(members.status, status));
    }

    if (search) {
      filters.push(ilike(people.fullName, `%${escapeLike(search)}%`));
    }

    if (congregationId) {
      filters.push(
        exists(
          this.db
            .select({ id: memberships.id })
            .from(memberships)
            .where(
              and(
                eq(memberships.memberId, members.id),
                eq(memberships.congregationId, congregationId),
                inArray(memberships.status, [...OPEN_STATUSES]),
              ),
            ),
        ),
      );
    }

    if (after) {
      filters.push(gt(members.id, after));
    }

    const rows = await this.db
      .select(memberViewColumns)
      .from(members)
      .innerJoin(people, eq(people.id, members.personId))
      .where(and(...filters))
      .orderBy(asc(members.id))
      .limit(limit);

    return rows.map((row) => toMemberView(row));
  }

  async insert(member: Member): Promise<void> {
    await this.db.insert(members).values(member.toSnapshot());
  }

  private async findOne(condition: SQL): Promise<MemberView | null> {
    const [row] = await this.db
      .select(memberViewColumns)
      .from(members)
      .innerJoin(people, eq(people.id, members.personId))
      .where(condition)
      .limit(1);

    return row ? toMemberView(row) : null;
  }
}

@Injectable()
export class DrizzleMembershipRepository extends MembershipRepository {
  private readonly db: Database;

  constructor(@Inject(DatabaseService) databaseService: DatabaseService) {
    super();

    this.db = databaseService.db;
  }

  async findById(id: string): Promise<Membership | null> {
    const [row] = await this.db.select().from(memberships).where(eq(memberships.id, id)).limit(1);

    return row ? Membership.restore(toMembershipSnapshot(row)) : null;
  }

  async listByMember(memberId: string): Promise<MembershipSnapshot[]> {
    const rows = await this.db
      .select()
      .from(memberships)
      .where(eq(memberships.memberId, memberId))
      .orderBy(asc(memberships.id));

    return rows.map((row) => toMembershipSnapshot(row));
  }

  async hasOpenMemberships(memberId: string): Promise<boolean> {
    const [row] = await this.db
      .select({ id: memberships.id })
      .from(memberships)
      .where(
        and(eq(memberships.memberId, memberId), inArray(memberships.status, [...OPEN_STATUSES])),
      )
      .limit(1);

    return row !== undefined;
  }

  async insert(membership: Membership): Promise<'inserted' | 'duplicate'> {
    try {
      await this.db.insert(memberships).values(membership.toSnapshot());
    } catch (error) {
      if (isUniqueViolation(error)) {
        return 'duplicate';
      }

      throw error;
    }

    return 'inserted';
  }

  async update(membership: Membership): Promise<number | null | 'primary_taken'> {
    const { endedOn, id, startedOn, status, version } = membership.toSnapshot();

    try {
      const [row] = await this.db
        .update(memberships)
        .set({ status, startedOn, endedOn, ...nextVersion })
        .where(and(eq(memberships.id, id), eq(memberships.version, version)))
        .returning({ version: memberships.version });

      return row?.version ?? null;
    } catch (error) {
      // A única restrição única afetada por uma mudança de situação é a do vínculo principal.
      if (isUniqueViolation(error)) {
        return 'primary_taken';
      }

      throw error;
    }
  }
}

@Injectable()
export class UuidV7IdGenerator extends IdGenerator {
  next(): string {
    return uuidv7();
  }
}

// Fuso da comunidade (Campo Grande/MS): evita "amanhã" ou "ontem" perto da meia-noite UTC.
const TODAY_FORMAT = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Campo_Grande',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

@Injectable()
export class SystemClock extends Clock {
  today(): string {
    return TODAY_FORMAT.format(new Date());
  }
}
