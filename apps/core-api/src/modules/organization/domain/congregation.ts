import { err, ok, type Result } from '../../../shared/domain/result.js';
import type { EmailAddress, PhoneNumber } from '../../../shared/domain/value-objects/contact.js';
import type { StatusTransitionError } from './organization.js';
import type { Cnpj } from './value-objects/cnpj.js';
import type { InstitutionalCode, InstitutionalName } from './value-objects/institutional.js';
import type { PostalAddress, PostalAddressProps } from './value-objects/postal-address.js';

export type CongregationStatus = 'DRAFT' | 'ACTIVE' | 'INACTIVE';

export interface CongregationDetails {
  name: InstitutionalName;
  cnpj: Cnpj | null;
  address: PostalAddress;
  phone: PhoneNumber | null;
  email: EmailAddress | null;
}

export interface CongregationSnapshot {
  id: string;
  organizationId: string;
  code: string;
  name: string;
  cnpj: string | null;
  address: PostalAddressProps;
  phone: string | null;
  email: string | null;
  headquarters: boolean;
  status: CongregationStatus;
  version: number;
}

export interface RegisterCongregation {
  id: string;
  organizationId: string;
  code: InstitutionalCode;
  details: CongregationDetails;
}

const detailsToState = (details: CongregationDetails) => ({
  name: details.name.value,
  cnpj: details.cnpj?.value ?? null,
  address: details.address.toProps(),
  phone: details.phone?.value ?? null,
  email: details.email?.value ?? null,
});

// Igreja local vinculada à organização. Nasce DRAFT e só aceita vínculos depois de ativada; a
// inativação preserva os dados e o histórico, e a congregação pode ser reativada.
export class Congregation {
  private constructor(private state: CongregationSnapshot) {}

  static register({ code, details, id, organizationId }: RegisterCongregation): Congregation {
    return new Congregation({
      id,
      organizationId,
      code: code.value,
      ...detailsToState(details),
      headquarters: false,
      status: 'DRAFT',
      version: 1,
    });
  }

  // Reconstitui um estado já validado e persistido.
  static restore(snapshot: CongregationSnapshot): Congregation {
    return new Congregation({ ...snapshot, address: { ...snapshot.address } });
  }

  get id(): string {
    return this.state.id;
  }

  get organizationId(): string {
    return this.state.organizationId;
  }

  get status(): CongregationStatus {
    return this.state.status;
  }

  get version(): number {
    return this.state.version;
  }

  updateDetails(details: CongregationDetails): void {
    this.state = { ...this.state, ...detailsToState(details) };
  }

  // Ativação inicial (DRAFT) ou reativação (INACTIVE).
  activate(): Result<void, StatusTransitionError> {
    if (this.state.status === 'ACTIVE') {
      return err('invalid_status_transition');
    }

    this.state = { ...this.state, status: 'ACTIVE' };

    return ok();
  }

  deactivate(): Result<void, StatusTransitionError> {
    if (this.state.status !== 'ACTIVE') {
      return err('invalid_status_transition');
    }

    this.state = { ...this.state, status: 'INACTIVE' };

    return ok();
  }

  toSnapshot(): CongregationSnapshot {
    return { ...this.state, address: { ...this.state.address } };
  }
}
