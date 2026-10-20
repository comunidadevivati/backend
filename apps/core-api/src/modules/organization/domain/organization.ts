import { err, ok, type Result } from '../../../shared/domain/result.js';
import type { EmailAddress, PhoneNumber } from '../../../shared/domain/value-objects/contact.js';
import type { Cnpj } from './value-objects/cnpj.js';
import type { InstitutionalName } from './value-objects/institutional.js';
import type { PostalAddress, PostalAddressProps } from './value-objects/postal-address.js';

export type OrganizationStatus = 'ACTIVE' | 'INACTIVE';

export interface OrganizationDetails {
  legalName: InstitutionalName;
  tradeName: InstitutionalName;
  cnpj: Cnpj;
  address: PostalAddress;
  phone: PhoneNumber;
  email: EmailAddress;
}

export interface OrganizationSnapshot {
  id: string;
  legalName: string;
  tradeName: string;
  cnpj: string;
  address: PostalAddressProps;
  phone: string;
  email: string;
  status: OrganizationStatus;
  version: number;
}

export type StatusTransitionError = 'invalid_status_transition';

// Organização principal (Matriz): raiz da hierarquia, à qual todas as congregações pertencem.
export class Organization {
  private constructor(private state: OrganizationSnapshot) {}

  // Reconstitui um estado já validado e persistido.
  static restore(snapshot: OrganizationSnapshot): Organization {
    return new Organization({ ...snapshot, address: { ...snapshot.address } });
  }

  get id(): string {
    return this.state.id;
  }

  get status(): OrganizationStatus {
    return this.state.status;
  }

  get version(): number {
    return this.state.version;
  }

  updateDetails(details: OrganizationDetails): void {
    this.state = {
      ...this.state,
      legalName: details.legalName.value,
      tradeName: details.tradeName.value,
      cnpj: details.cnpj.value,
      address: details.address.toProps(),
      phone: details.phone.value,
      email: details.email.value,
    };
  }

  activate(): Result<void, StatusTransitionError> {
    return this.transition('INACTIVE', 'ACTIVE');
  }

  deactivate(): Result<void, StatusTransitionError> {
    return this.transition('ACTIVE', 'INACTIVE');
  }

  toSnapshot(): OrganizationSnapshot {
    return { ...this.state, address: { ...this.state.address } };
  }

  private transition(
    from: OrganizationStatus,
    to: OrganizationStatus,
  ): Result<void, StatusTransitionError> {
    if (this.state.status !== from) {
      return err('invalid_status_transition');
    }

    this.state = { ...this.state, status: to };

    return ok();
  }
}
