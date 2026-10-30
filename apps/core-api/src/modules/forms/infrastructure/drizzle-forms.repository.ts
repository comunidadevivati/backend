import { Inject, Injectable } from '@nestjs/common';
import { and, count, desc, eq, lt, sql, type SQL } from 'drizzle-orm';
import { DatabaseService } from '../../../shared/infrastructure/database/database.service.js';
import { FormRepository, type FormListQuery } from '../application/ports.js';
import { Form, FORM_STATUSES, type FormSnapshot, type FormStatus } from '../domain/form.js';
import { forms } from './database/forms.schema.js';
import type { Database } from '../../../shared/infrastructure/database/database.js';

// Os registros Drizzle não saem desta camada: são convertidos em snapshots do Domain.

type FormRow = typeof forms.$inferSelect;

const toSnapshot = (row: FormRow): FormSnapshot => ({
  id: row.id,
  department: row.department,
  title: row.title,
  description: row.description,
  startsOn: row.startsOn,
  endsOn: row.endsOn,
  status: row.status,
  // Perguntas gravadas antes de "obrigatória", "escala" e nomes por ponto existirem.
  questions: row.questions.map((question) => ({
    ...question,
    required: question.required ?? false,
    scale: question.scale
      ? { ...question.scale, pointLabels: question.scale.pointLabels ?? null }
      : null,
  })),
  recipientGroupIds: row.recipientGroupIds,
  anonymous: row.anonymous,
  allowAnswerEdit: row.allowAnswerEdit,
  consentText: row.consentText,
  headerImage:
    row.headerImageKey === null
      ? null
      : {
          key: row.headerImageKey,
          width: row.headerImageWidth ?? 0,
          height: row.headerImageHeight ?? 0,
          contentType: row.headerImageContentType ?? 'image/webp',
          byteSize: row.headerImageByteSize ?? 0,
        },
  emailDispatch:
    row.emailDispatchId === null || row.emailDispatchStatus === null
      ? null
      : {
          id: row.emailDispatchId,
          kind: row.emailDispatchKind ?? 'INVITE',
          status: row.emailDispatchStatus,
          startedAt: row.emailDispatchStartedAt?.toISOString() ?? row.updatedAt.toISOString(),
          finishedAt: row.emailDispatchFinishedAt?.toISOString() ?? null,
          sentCount: row.emailDispatchSentCount,
          failedCount: row.emailDispatchFailedCount,
        },
  answersPurgedAt: row.answersPurgedAt?.toISOString() ?? null,
  version: row.version,
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
});

const toDate = (value: string | null | undefined): Date | null => (value ? new Date(value) : null);

// Colunas gravadas a partir do Aggregate (criação e edição).
const toColumns = (snapshot: FormSnapshot) => ({
  title: snapshot.title,
  description: snapshot.description,
  startsOn: snapshot.startsOn,
  endsOn: snapshot.endsOn,
  status: snapshot.status,
  questions: snapshot.questions,
  recipientGroupIds: snapshot.recipientGroupIds,
  anonymous: snapshot.anonymous,
  allowAnswerEdit: snapshot.allowAnswerEdit,
  consentText: snapshot.consentText,
  headerImageKey: snapshot.headerImage?.key ?? null,
  headerImageWidth: snapshot.headerImage?.width ?? null,
  headerImageHeight: snapshot.headerImage?.height ?? null,
  headerImageContentType: snapshot.headerImage?.contentType ?? null,
  headerImageByteSize: snapshot.headerImage?.byteSize ?? null,
  emailDispatchId: snapshot.emailDispatch?.id ?? null,
  emailDispatchStatus: snapshot.emailDispatch?.status ?? null,
  emailDispatchKind: snapshot.emailDispatch?.kind ?? null,
  answersPurgedAt: toDate(snapshot.answersPurgedAt),
  emailDispatchStartedAt: toDate(snapshot.emailDispatch?.startedAt),
  emailDispatchFinishedAt: toDate(snapshot.emailDispatch?.finishedAt),
  emailDispatchSentCount: snapshot.emailDispatch?.sentCount ?? 0,
  emailDispatchFailedCount: snapshot.emailDispatch?.failedCount ?? 0,
});

@Injectable()
export class DrizzleFormRepository extends FormRepository {
  private readonly db: Database;

  constructor(@Inject(DatabaseService) databaseService: DatabaseService) {
    super();

    this.db = databaseService.db;
  }

  async findById(id: string): Promise<Form | null> {
    const [row] = await this.db.select().from(forms).where(eq(forms.id, id)).limit(1);

    return row ? Form.restore(toSnapshot(row)) : null;
  }

  async list({ after, department, limit, status }: FormListQuery): Promise<FormSnapshot[]> {
    const filters: SQL[] = [eq(forms.department, department)];

    if (status) {
      filters.push(eq(forms.status, status));
    }

    if (after) {
      filters.push(lt(forms.id, after));
    }

    const rows = await this.db
      .select()
      .from(forms)
      .where(and(...filters))
      .orderBy(desc(forms.id))
      .limit(limit);

    return rows.map((row) => toSnapshot(row));
  }

  async countByStatus(department: string): Promise<Record<FormStatus, number>> {
    const rows = await this.db
      .select({ status: forms.status, total: count() })
      .from(forms)
      .where(eq(forms.department, department))
      .groupBy(forms.status);

    const totals = new Map(rows.map(({ status, total }) => [status, total]));

    return Object.fromEntries(
      FORM_STATUSES.map((status) => [status, totals.get(status) ?? 0]),
    ) as Record<FormStatus, number>;
  }

  async insert(form: Form): Promise<void> {
    const snapshot = form.toSnapshot();

    await this.db
      .insert(forms)
      .values({ id: snapshot.id, department: snapshot.department, ...toColumns(snapshot) });
  }

  async update(form: Form): Promise<FormSnapshot | null> {
    const snapshot = form.toSnapshot();

    const [row] = await this.db
      .update(forms)
      .set({
        ...toColumns(snapshot),
        version: sql`${forms.version} + 1`,
        updatedAt: sql`now()`,
      })
      .where(and(eq(forms.id, snapshot.id), eq(forms.version, snapshot.version)))
      .returning();

    return row ? toSnapshot(row) : null;
  }

  async delete(id: string): Promise<void> {
    await this.db.delete(forms).where(eq(forms.id, id));
  }
}
