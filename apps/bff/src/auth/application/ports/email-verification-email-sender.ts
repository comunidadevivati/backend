export interface SendEmailVerificationEmail {
  email: string;
  idempotencyKey: string;
  name: string;
  token: string;
  ttlHours: number;
}

export abstract class EmailVerificationEmailSender {
  abstract send(message: SendEmailVerificationEmail): Promise<void>;
}
