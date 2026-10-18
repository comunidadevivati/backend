import { Injectable } from '@nestjs/common';
import { PasswordRecoveryEmailSender } from '../../application/ports/password-recovery-email-sender.js';

@Injectable()
export class DisabledPasswordRecoveryEmailSender extends PasswordRecoveryEmailSender {
  send(): Promise<void> {
    return Promise.resolve();
  }
}
