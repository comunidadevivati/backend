export interface SendPasswordRecoveryEmail {
  email: string;
  idempotencyKey: string;
  name: string;
  token: string;
  ttlMinutes: number;
}

export abstract class PasswordRecoveryEmailSender {
  abstract send(message: SendPasswordRecoveryEmail): Promise<void>;
}
