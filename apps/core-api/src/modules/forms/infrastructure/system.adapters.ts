import { Inject, Injectable } from '@nestjs/common';
import { uuidv7 } from '../../../shared/infrastructure/id/uuid-v7.js';
import { EmailGroupDirectory } from '../../communication/public/email-group-directory.js';
import { Clock, IdGenerator, RecipientGroupCatalog } from '../application/ports.js';

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

export class SystemClock extends Clock {
  today(): string {
    return TODAY_FORMAT.format(new Date());
  }

  now(): Date {
    return new Date();
  }
}

// Anticorruption Layer: usa somente o contrato público de Communication.
@Injectable()
export class CommunicationRecipientGroupCatalog extends RecipientGroupCatalog {
  constructor(@Inject(EmailGroupDirectory) private readonly directory: EmailGroupDirectory) {
    super();
  }

  existingIds(ids: readonly string[]): Promise<string[]> {
    return this.directory.existingIds(ids);
  }

  memberAccountIds(groupIds: readonly string[]): Promise<string[]> {
    return this.directory.memberAccountIds(groupIds);
  }
}
