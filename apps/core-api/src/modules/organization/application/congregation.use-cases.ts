import { err, ok, type Result } from '../../../shared/domain/result.js';
import {
  Congregation,
  type CongregationSnapshot,
  type CongregationStatus,
} from '../domain/congregation.js';
import { InstitutionalCode } from '../domain/value-objects/institutional.js';
import {
  buildCongregationDetails,
  mergePatch,
  type CongregationDetailsInput,
  type CongregationPatch,
} from './details-input.js';
import {
  invalidStatusTransition,
  notFound,
  organizationInactive,
  versionConflict,
  type OrganizationError,
} from './organization-errors.js';
import type { StatusAction } from './organization.use-cases.js';
import type { CongregationRepository, IdGenerator, OrganizationRepository } from './ports.js';

export interface ListCongregationsQuery {
  status: CongregationStatus | null;
  cursor: string | null;
  limit: number;
}

export interface CongregationPage {
  items: CongregationSnapshot[];
  nextCursor: string | null;
}

export interface RegisterCongregationCommand extends CongregationDetailsInput {
  code: string;
}

export interface UpdateCongregationCommand {
  id: string;
  expectedVersion: number;
  patch: CongregationPatch;
}

export interface ChangeCongregationStatusCommand {
  id: string;
  action: StatusAction;
}

type CongregationResult = Result<CongregationSnapshot, OrganizationError>;

const withVersion = (snapshot: CongregationSnapshot, version: number): CongregationSnapshot => ({
  ...snapshot,
  version,
});

export class ListCongregationsUseCase {
  constructor(private readonly congregations: CongregationRepository) {}

  // Paginação por cursor: busca um item a mais para saber se existe a próxima página.
  async execute({ cursor, limit, status }: ListCongregationsQuery): Promise<CongregationPage> {
    const rows = await this.congregations.list({ status, after: cursor, limit: limit + 1 });

    const items = rows.slice(0, limit);

    return {
      items,
      nextCursor: rows.length > limit ? (items.at(-1)?.id ?? null) : null,
    };
  }
}

export class GetCongregationUseCase {
  constructor(private readonly congregations: CongregationRepository) {}

  async execute(id: string): Promise<CongregationResult> {
    const congregation = await this.congregations.findById(id);

    return congregation ? ok(congregation.toSnapshot()) : err(notFound);
  }
}

export class RegisterCongregationUseCase {
  constructor(
    private readonly organizations: OrganizationRepository,
    private readonly congregations: CongregationRepository,
    private readonly ids: IdGenerator,
  ) {}

  // Toda congregação pertence à organização principal e nasce DRAFT.
  async execute({ code, ...input }: RegisterCongregationCommand): Promise<CongregationResult> {
    const institutionalCode = InstitutionalCode.create(code);

    const details = buildCongregationDetails(input);

    if (!institutionalCode.ok || !details.ok) {
      const fields = [
        ...(institutionalCode.ok ? [] : ['code']),
        ...(details.ok ? [] : details.error),
      ];

      return err({ type: 'invalid_fields', fields });
    }

    const organization = await this.organizations.findMain();

    if (!organization) {
      return err(notFound);
    }

    if (organization.status !== 'ACTIVE') {
      return err(organizationInactive);
    }

    const congregation = Congregation.register({
      id: this.ids.next(),
      organizationId: organization.id,
      code: institutionalCode.value,
      details: details.value,
    });

    const inserted = await this.congregations.insert(congregation);

    return inserted === 'code_taken' ? err({ type: 'code_taken' }) : ok(congregation.toSnapshot());
  }
}

export class UpdateCongregationUseCase {
  constructor(private readonly congregations: CongregationRepository) {}

  async execute({
    expectedVersion,
    id,
    patch,
  }: UpdateCongregationCommand): Promise<CongregationResult> {
    const congregation = await this.congregations.findById(id);

    if (!congregation) {
      return err(notFound);
    }

    if (congregation.version !== expectedVersion) {
      return err(versionConflict);
    }

    const { address, cnpj, email, name, phone } = congregation.toSnapshot();

    const details = buildCongregationDetails(
      mergePatch({ name, cnpj, address, phone, email }, patch),
    );

    if (!details.ok) {
      return err({ type: 'invalid_fields', fields: details.error });
    }

    congregation.updateDetails(details.value);

    const version = await this.congregations.update(congregation);

    return version === null
      ? err(versionConflict)
      : ok(withVersion(congregation.toSnapshot(), version));
  }
}

export class ChangeCongregationStatusUseCase {
  constructor(
    private readonly organizations: OrganizationRepository,
    private readonly congregations: CongregationRepository,
  ) {}

  async execute({ action, id }: ChangeCongregationStatusCommand): Promise<CongregationResult> {
    const congregation = await this.congregations.findById(id);

    if (!congregation) {
      return err(notFound);
    }

    // Não há congregação ativa sob uma organização inativa; a inativação continua permitida.
    if (action === 'activate') {
      const organization = await this.organizations.findMain();

      if (organization?.status !== 'ACTIVE') {
        return err(organizationInactive);
      }
    }

    const transition = action === 'activate' ? congregation.activate() : congregation.deactivate();

    if (!transition.ok) {
      return err(invalidStatusTransition);
    }

    const version = await this.congregations.update(congregation);

    return version === null
      ? err(versionConflict)
      : ok(withVersion(congregation.toSnapshot(), version));
  }
}
