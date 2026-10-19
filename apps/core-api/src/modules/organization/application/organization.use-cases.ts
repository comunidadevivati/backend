import { err, ok, type Result } from '../../../shared/domain/result.js';
import { buildOrganizationDetails, mergePatch, type OrganizationPatch } from './details-input.js';
import {
  invalidStatusTransition,
  notFound,
  versionConflict,
  type OrganizationError,
} from './organization-errors.js';
import type { OrganizationSnapshot } from '../domain/organization.js';
import type { OrganizationRepository } from './ports.js';

export type StatusAction = 'activate' | 'deactivate';

export interface UpdateOrganizationCommand {
  expectedVersion: number;
  patch: OrganizationPatch;
}

const withVersion = (snapshot: OrganizationSnapshot, version: number): OrganizationSnapshot => ({
  ...snapshot,
  version,
});

export class GetOrganizationUseCase {
  constructor(private readonly organizations: OrganizationRepository) {}

  async execute(): Promise<Result<OrganizationSnapshot, OrganizationError>> {
    const organization = await this.organizations.findMain();

    return organization ? ok(organization.toSnapshot()) : err(notFound);
  }
}

export class UpdateOrganizationUseCase {
  constructor(private readonly organizations: OrganizationRepository) {}

  async execute({
    expectedVersion,
    patch,
  }: UpdateOrganizationCommand): Promise<Result<OrganizationSnapshot, OrganizationError>> {
    const organization = await this.organizations.findMain();

    if (!organization) {
      return err(notFound);
    }

    if (organization.version !== expectedVersion) {
      return err(versionConflict);
    }

    const { address, cnpj, email, legalName, phone, tradeName } = organization.toSnapshot();

    const details = buildOrganizationDetails(
      mergePatch({ legalName, tradeName, cnpj, address, phone, email }, patch),
    );

    if (!details.ok) {
      return err({ type: 'invalid_fields', fields: details.error });
    }

    organization.updateDetails(details.value);

    const version = await this.organizations.update(organization);

    return version === null
      ? err(versionConflict)
      : ok(withVersion(organization.toSnapshot(), version));
  }
}

export class ChangeOrganizationStatusUseCase {
  constructor(private readonly organizations: OrganizationRepository) {}

  async execute(action: StatusAction): Promise<Result<OrganizationSnapshot, OrganizationError>> {
    const organization = await this.organizations.findMain();

    if (!organization) {
      return err(notFound);
    }

    const transition = action === 'activate' ? organization.activate() : organization.deactivate();

    if (!transition.ok) {
      return err(invalidStatusTransition);
    }

    const version = await this.organizations.update(organization);

    return version === null
      ? err(versionConflict)
      : ok(withVersion(organization.toSnapshot(), version));
  }
}
