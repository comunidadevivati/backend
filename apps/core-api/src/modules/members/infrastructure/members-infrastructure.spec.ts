import { describe, expect, it } from 'vitest';
import {
  CongregationDirectory,
  type CongregationSummary,
} from '../../organization/public/congregation-directory.js';
import { SystemClock, UuidV7IdGenerator } from './drizzle-members.repositories.js';
import { OrganizationCongregationCatalog } from './organization-congregation-catalog.adapter.js';

const summaries: CongregationSummary[] = [
  { id: 'c-1', code: 'SEDE', name: 'Sede', status: 'ACTIVE' },
  { id: 'c-2', code: 'CG-SUL', name: 'Congregação Sul', status: 'DRAFT' },
];

class StubDirectory extends CongregationDirectory {
  findById(id: string): Promise<CongregationSummary | null> {
    return Promise.resolve(summaries.find((summary) => summary.id === id) ?? null);
  }

  findByIds(ids: readonly string[]): Promise<CongregationSummary[]> {
    return Promise.resolve(summaries.filter((summary) => ids.includes(summary.id)));
  }
}

describe('OrganizationCongregationCatalog', () => {
  const catalog = new OrganizationCongregationCatalog(new StubDirectory());

  it('deve traduzir a situação pública em "ativa" para o contexto Members', async () => {
    await expect(catalog.findById('c-1')).resolves.toEqual({
      id: 'c-1',
      code: 'SEDE',
      name: 'Sede',
      active: true,
    });

    await expect(catalog.findByIds(['c-2', 'c-9'])).resolves.toEqual([
      { id: 'c-2', code: 'CG-SUL', name: 'Congregação Sul', active: false },
    ]);

    await expect(catalog.findById('c-9')).resolves.toBeNull();
  });
});

describe('SystemClock e UuidV7IdGenerator', () => {
  it('deve informar a data civil em AAAA-MM-DD e gerar UUIDv7', () => {
    expect(new SystemClock().today()).toMatch(/^\d{4}-\d{2}-\d{2}$/u);

    expect(new UuidV7IdGenerator().next()).toMatch(
      /^[\da-f]{8}-[\da-f]{4}-7[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/u,
    );
  });
});
