import { Injectable } from '@nestjs/common';
import { EmailChangeEmailSender } from '../../application/ports/email-change-email-sender.js';

@Injectable()
export class DisabledEmailChangeEmailSender extends EmailChangeEmailSender {
  sendConfirmation(): Promise<void> {
    return Promise.resolve();
  }

  sendChangedNotice(): Promise<void> {
    return Promise.resolve();
  }
}
