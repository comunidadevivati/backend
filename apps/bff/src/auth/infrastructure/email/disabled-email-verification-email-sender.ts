import { Injectable } from '@nestjs/common';
import { EmailVerificationEmailSender } from '../../application/ports/email-verification-email-sender.js';

@Injectable()
export class DisabledEmailVerificationEmailSender extends EmailVerificationEmailSender {
  send(): Promise<void> {
    return Promise.resolve();
  }
}
