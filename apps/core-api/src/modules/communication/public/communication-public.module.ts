import { Module } from '@nestjs/common';
import { DrizzleEmailGroupDirectory } from '../infrastructure/email-group-directory.adapter.js';
import { EmailGroupDirectory } from './email-group-directory.js';

// Ponto de entrada de Communication para os demais contextos: fornece somente o contrato público.
@Module({
  providers: [{ provide: EmailGroupDirectory, useClass: DrizzleEmailGroupDirectory }],
  exports: [EmailGroupDirectory],
})
export class CommunicationPublicModule {}
