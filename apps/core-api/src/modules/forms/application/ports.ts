import type { FormAnswer, FormInvitation } from '../domain/form-invitation.js';
import type { Form, FormSnapshot, FormStatus } from '../domain/form.js';

// As Ports são classes abstratas para servirem também de token de injeção na composição.

export interface FormListQuery {
  department: string;
  status: FormStatus | null;
  // Cursor: ID (UUIDv7, ordenável por criação) do último item da página anterior.
  after: string | null;
  limit: number;
}

export abstract class FormRepository {
  abstract findById(id: string): Promise<Form | null>;

  // Mais recentes primeiro (ordem de criação).
  abstract list(query: FormListQuery): Promise<FormSnapshot[]>;

  abstract countByStatus(department: string): Promise<Record<FormStatus, number>>;

  abstract insert(form: Form): Promise<void>;

  // Controle otimista: grava somente se a versão persistida ainda for a do Aggregate carregado.
  abstract update(form: Form): Promise<FormSnapshot | null>;

  abstract delete(id: string): Promise<void>;
}

// Bucket de mídia (R2 ou emulador S3), área privada da pasta do ambiente.
export abstract class FormImageStorage {
  // false quando MEDIA_STORAGE=disabled.
  abstract readonly enabled: boolean;

  abstract presignUpload(
    key: string,
    contentType: string,
    expiresInSeconds: number,
  ): Promise<string>;

  // fileName: nome do arquivo ao baixar pelo visualizador do navegador (o arquivo abre na aba).
  abstract presignDownload(
    key: string,
    expiresInSeconds: number,
    fileName?: string,
  ): Promise<string>;

  abstract size(key: string): Promise<number | null>;

  abstract read(key: string): Promise<Uint8Array | null>;

  abstract write(key: string, body: Uint8Array, contentType: string): Promise<void>;

  abstract delete(keys: readonly string[]): Promise<void>;
}

export interface ProcessedHeaderImage {
  body: Uint8Array;
  width: number;
  height: number;
}

export abstract class HeaderImageProcessor {
  // null quando o conteúdo não é uma imagem aceita (independe do tipo declarado).
  abstract process(input: Uint8Array): Promise<ProcessedHeaderImage | null>;
}

// Anticorruption Layer para os grupos de e-mails do contexto Communication.
export abstract class RecipientGroupCatalog {
  abstract existingIds(ids: readonly string[]): Promise<string[]>;

  // Contas dos grupos informados, sem repetição.
  abstract memberAccountIds(groupIds: readonly string[]): Promise<string[]>;
}

export interface InvitationStats {
  invitedCount: number;
  answeredCount: number;
}

// Resposta sem vínculo com a pessoa: só a data, nunca a hora (que permitiria cruzar com o convite).
export interface AnonymousResponse {
  id: string;
  formId: string;
  answers: FormAnswer[];
  submittedOn: string;
}

export abstract class FormInvitationRepository {
  abstract findById(id: string): Promise<FormInvitation | null>;

  abstract findByForm(formId: string): Promise<FormInvitation[]>;

  // Convite pelo ID da mensagem do provedor de e-mail (webhook de entrega).
  abstract findByMessageId(messageId: string): Promise<FormInvitation | null>;

  abstract deleteAnonymousAnswers(formId: string): Promise<void>;

  abstract findByTokenHash(tokenHash: string): Promise<FormInvitation | null>;

  // Grava convites novos e atualiza os existentes (por ID), numa transação.
  abstract saveAll(invitations: readonly FormInvitation[]): Promise<void>;

  // Controle otimista: false quando o convite mudou desde a leitura.
  abstract update(invitation: FormInvitation): Promise<boolean>;

  abstract statsByForms(formIds: readonly string[]): Promise<Map<string, InvitationStats>>;

  // Contas que já responderam (pelo link ou em papel), por formulário.
  abstract answeredAccountIds(formIds: readonly string[]): Promise<Map<string, Set<string>>>;

  // Formulário anônimo: marca o convite e grava as respostas à parte, na mesma transação. false
  // quando o convite mudou desde a leitura.
  abstract updateWithAnonymousResponse(
    invitation: FormInvitation,
    response: AnonymousResponse,
  ): Promise<boolean>;

  abstract listAnonymousAnswers(formId: string): Promise<FormAnswer[][]>;
}

// Token do link de resposta: aleatório, entregue uma única vez; só o hash é guardado.
export abstract class InvitationTokens {
  abstract generate(): { token: string; hash: string };

  abstract hash(token: string): string;
}

export abstract class IdGenerator {
  abstract next(): string;
}

export abstract class Clock {
  // Data civil atual (AAAA-MM-DD) no fuso da comunidade.
  abstract today(): string;

  abstract now(): Date;
}
