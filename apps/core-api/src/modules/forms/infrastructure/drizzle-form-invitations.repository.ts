import { createHash, randomBytes } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { and, count, eq, inArray, sql } from 'drizzle-orm';
import { DatabaseService } from '../../../shared/infrastructure/database/database.service.js';
import {
  FormInvitationRepository,
  InvitationTokens,
  type AnonymousResponse,
  type InvitationStats,
} from '../application/ports.js';
import {
  FormInvitation,
  type FormAnswer,
  type FormInvitationSnapshot,
} from '../domain/form-invitation.js';
import { formAnonymousResponses, formInvitations } from './database/forms.schema.js';
import type { Database } from '../../../shared/infrastructure/database/database.js';

type InvitationRow = typeof formInvitations.$inferSelect;

const toSnapshot = (row: InvitationRow): FormInvitationSnapshot => ({
  id: row.id,
  formId: row.formId,
  accountId: row.accountId,
  recipientName: row.recipientName,
  recipientEmail: row.recipientEmail,
  tokenHash: row.tokenHash,
  status: row.status,
  sentAt: row.sentAt.toISOString(),
  answeredAt: row.answeredAt?.toISOString() ?? null,
  answerChannel: row.answerChannel,
  // Respostas gravadas antes do campo "value" existir.
  answers: row.answers.map((answer) => ({ ...answer, value: answer.value ?? null })),
  emailMessageId: row.emailMessageId,
  deliveryStatus: row.deliveryStatus,
  deliveryUpdatedAt: row.deliveryUpdatedAt?.toISOString() ?? null,
  paperAttachment:
    row.paperAttachmentKey === null
      ? null
      : {
          key: row.paperAttachmentKey,
          fileName: row.paperAttachmentFileName ?? 'formulario',
          contentType: row.paperAttachmentContentType ?? 'application/octet-stream',
          byteSize: row.paperAttachmentByteSize ?? 0,
        },
  version: row.version,
});

const toColumns = (snapshot: FormInvitationSnapshot) => ({
  recipientName: snapshot.recipientName,
  recipientEmail: snapshot.recipientEmail,
  tokenHash: snapshot.tokenHash,
  status: snapshot.status,
  sentAt: new Date(snapshot.sentAt),
  answeredAt: snapshot.answeredAt ? new Date(snapshot.answeredAt) : null,
  answerChannel: snapshot.answerChannel,
  answers: snapshot.answers,
  emailMessageId: snapshot.emailMessageId,
  deliveryStatus: snapshot.deliveryStatus,
  deliveryUpdatedAt: snapshot.deliveryUpdatedAt ? new Date(snapshot.deliveryUpdatedAt) : null,
  paperAttachmentKey: snapshot.paperAttachment?.key ?? null,
  paperAttachmentFileName: snapshot.paperAttachment?.fileName ?? null,
  paperAttachmentContentType: snapshot.paperAttachment?.contentType ?? null,
  paperAttachmentByteSize: snapshot.paperAttachment?.byteSize ?? null,
});

@Injectable()
export class DrizzleFormInvitationRepository extends FormInvitationRepository {
  private readonly db: Database;

  constructor(@Inject(DatabaseService) databaseService: DatabaseService) {
    super();

    this.db = databaseService.db;
  }

  async findById(id: string): Promise<FormInvitation | null> {
    const [row] = await this.db
      .select()
      .from(formInvitations)
      .where(eq(formInvitations.id, id))
      .limit(1);

    return row ? FormInvitation.restore(toSnapshot(row)) : null;
  }

  async findByMessageId(messageId: string): Promise<FormInvitation | null> {
    const [row] = await this.db
      .select()
      .from(formInvitations)
      .where(eq(formInvitations.emailMessageId, messageId))
      .limit(1);

    return row ? FormInvitation.restore(toSnapshot(row)) : null;
  }

  async deleteAnonymousAnswers(formId: string): Promise<void> {
    await this.db.delete(formAnonymousResponses).where(eq(formAnonymousResponses.formId, formId));
  }

  async findByForm(formId: string): Promise<FormInvitation[]> {
    const rows = await this.db
      .select()
      .from(formInvitations)
      .where(eq(formInvitations.formId, formId));

    return rows.map((row) => FormInvitation.restore(toSnapshot(row)));
  }

  async findByTokenHash(tokenHash: string): Promise<FormInvitation | null> {
    const [row] = await this.db
      .select()
      .from(formInvitations)
      .where(eq(formInvitations.tokenHash, tokenHash))
      .limit(1);

    return row ? FormInvitation.restore(toSnapshot(row)) : null;
  }

  async saveAll(invitations: readonly FormInvitation[]): Promise<void> {
    if (invitations.length === 0) {
      return;
    }

    await this.db.transaction(async (tx) => {
      for (const invitation of invitations) {
        const snapshot = invitation.toSnapshot();

        // oxlint-disable-next-line no-await-in-loop -- gravações em sequência na mesma transação
        await tx
          .insert(formInvitations)
          .values({
            id: snapshot.id,
            formId: snapshot.formId,
            accountId: snapshot.accountId,
            ...toColumns(snapshot),
          })
          .onConflictDoUpdate({
            target: formInvitations.id,
            set: { ...toColumns(snapshot), version: sql`${formInvitations.version} + 1` },
          });
      }
    });
  }

  async update(invitation: FormInvitation): Promise<boolean> {
    const snapshot = invitation.toSnapshot();

    const rows = await this.db
      .update(formInvitations)
      .set({ ...toColumns(snapshot), version: sql`${formInvitations.version} + 1` })
      .where(
        and(eq(formInvitations.id, snapshot.id), eq(formInvitations.version, snapshot.version)),
      )
      .returning({ id: formInvitations.id });

    return rows.length > 0;
  }

  // Resposta de formulário anônimo: marca o convite e grava as respostas sem vínculo, juntos.
  async updateWithAnonymousResponse(
    invitation: FormInvitation,
    response: AnonymousResponse,
  ): Promise<boolean> {
    const snapshot = invitation.toSnapshot();

    return this.db.transaction(async (tx) => {
      const rows = await tx
        .update(formInvitations)
        .set({ ...toColumns(snapshot), version: sql`${formInvitations.version} + 1` })
        .where(
          and(eq(formInvitations.id, snapshot.id), eq(formInvitations.version, snapshot.version)),
        )
        .returning({ id: formInvitations.id });

      if (rows.length === 0) {
        return false;
      }

      await tx.insert(formAnonymousResponses).values(response);

      return true;
    });
  }

  async listAnonymousAnswers(formId: string): Promise<FormAnswer[][]> {
    const rows = await this.db
      .select({ answers: formAnonymousResponses.answers })
      .from(formAnonymousResponses)
      .where(eq(formAnonymousResponses.formId, formId));

    return rows.map(({ answers }) =>
      answers.map((answer) => ({ ...answer, value: answer.value ?? null })),
    );
  }

  async statsByForms(formIds: readonly string[]): Promise<Map<string, InvitationStats>> {
    if (formIds.length === 0) {
      return new Map();
    }

    const rows = await this.db
      .select({
        formId: formInvitations.formId,
        invitedCount: count(),
        answeredCount: sql<number>`count(*) filter (where ${formInvitations.status} = 'ANSWERED')::int`,
      })
      .from(formInvitations)
      .where(inArray(formInvitations.formId, [...formIds]))
      .groupBy(formInvitations.formId);

    return new Map(
      rows.map(({ answeredCount, formId, invitedCount }) => [
        formId,
        { invitedCount, answeredCount },
      ]),
    );
  }

  async answeredAccountIds(formIds: readonly string[]): Promise<Map<string, Set<string>>> {
    const answered = new Map<string, Set<string>>();

    if (formIds.length === 0) {
      return answered;
    }

    const rows = await this.db
      .select({ formId: formInvitations.formId, accountId: formInvitations.accountId })
      .from(formInvitations)
      .where(
        and(inArray(formInvitations.formId, [...formIds]), eq(formInvitations.status, 'ANSWERED')),
      );

    for (const { accountId, formId } of rows) {
      answered.set(formId, (answered.get(formId) ?? new Set()).add(accountId));
    }

    return answered;
  }
}

// 32 bytes aleatórios em base64url no link; SHA-256 em hexadecimal no banco.
export class RandomInvitationTokens extends InvitationTokens {
  generate(): { token: string; hash: string } {
    const token = randomBytes(32).toString('base64url');

    return { token, hash: this.hash(token) };
  }

  hash(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }
}
