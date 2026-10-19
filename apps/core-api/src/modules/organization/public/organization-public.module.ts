import { Module } from '@nestjs/common';
import { DrizzleCongregationDirectory } from '../infrastructure/congregation-directory.adapter.js';
import { CongregationDirectory } from './congregation-directory.js';

// Ponto de entrada de Organization para os demais contextos: fornece somente o contrato público.
@Module({
  providers: [{ provide: CongregationDirectory, useClass: DrizzleCongregationDirectory }],
  exports: [CongregationDirectory],
})
export class OrganizationPublicModule {}
