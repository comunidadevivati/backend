import { Inject, Injectable } from '@nestjs/common';
import {
  CongregationDirectory,
  type CongregationSummary,
} from '../../organization/public/congregation-directory.js';
import { CongregationCatalog, type CongregationRef } from '../application/ports.js';

const toRef = ({ code, id, name, status }: CongregationSummary): CongregationRef => ({
  id,
  code,
  name,
  active: status === 'ACTIVE',
});

// Anticorruption Layer: traduz o contrato público de Organization para o modelo de Members.
@Injectable()
export class OrganizationCongregationCatalog extends CongregationCatalog {
  constructor(@Inject(CongregationDirectory) private readonly directory: CongregationDirectory) {
    super();
  }

  async findById(id: string): Promise<CongregationRef | null> {
    const summary = await this.directory.findById(id);

    return summary ? toRef(summary) : null;
  }

  async findByIds(ids: readonly string[]): Promise<CongregationRef[]> {
    return (await this.directory.findByIds(ids)).map((summary) => toRef(summary));
  }
}
