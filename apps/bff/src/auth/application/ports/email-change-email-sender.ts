export interface SendEmailChangeConfirmation {
  // Novo e-mail, que recebe o link de confirmação.
  email: string;
  idempotencyKey: string;
  name: string;
  token: string;
  ttlHours: number;
}

export interface SendEmailChangedNotice {
  // E-mail anterior, avisado da troca já concluída.
  email: string;
  idempotencyKey: string;
  name: string;
  newEmail: string;
}

export abstract class EmailChangeEmailSender {
  abstract sendConfirmation(message: SendEmailChangeConfirmation): Promise<void>;

  abstract sendChangedNotice(message: SendEmailChangedNotice): Promise<void>;
}
