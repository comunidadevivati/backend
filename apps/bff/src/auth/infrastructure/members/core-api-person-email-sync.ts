import { Inject, Injectable } from '@nestjs/common';
import { CoreApiClient } from '../../../core-api/infrastructure/core-api.client.js';
import { PersonEmailSync } from '../../application/ports/person-email-sync.js';

// PUT /api/v1/people/:id/email da Core API (credencial de serviço).
@Injectable()
export class CoreApiPersonEmailSync extends PersonEmailSync {
  constructor(@Inject(CoreApiClient) private readonly coreApi: CoreApiClient) {
    super();
  }

  async sync(personId: string, email: string): Promise<void> {
    const { status } = await this.coreApi.send({
      method: 'PUT',
      path: `people/${personId}/email`,
      body: { email },
    });

    if (status !== 200) {
      throw new Error(`Core API respondeu ${status} ao trocar o e-mail da Pessoa.`);
    }
  }
}
