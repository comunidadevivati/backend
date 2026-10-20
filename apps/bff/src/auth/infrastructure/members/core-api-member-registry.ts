import { Inject, Injectable, Logger } from '@nestjs/common';
import { z } from 'zod';
import { CoreApiClient } from '../../../core-api/infrastructure/core-api.client.js';
import {
  MemberRegistry,
  type MemberRegistration,
} from '../../application/ports/member-registry.js';

const enrolledMemberSchema = z.object({ person: z.object({ id: z.uuid() }) });

// Converte pela rota interna POST /api/v1/members da Core API (credencial de serviço): 201 quando cria
// Pessoa e membro, 200 quando a conta já tinha sido convertida.
@Injectable()
export class CoreApiMemberRegistry extends MemberRegistry {
  private readonly logger = new Logger(CoreApiMemberRegistry.name);

  constructor(@Inject(CoreApiClient) private readonly coreApi: CoreApiClient) {
    super();
  }

  async register(registration: MemberRegistration): Promise<string | null> {
    const { body, status } = await this.coreApi.send({
      method: 'POST',
      path: 'members',
      body: registration,
    });

    // Recusa de regra do Members (ex.: nome fora do padrão de uma conta criada pelo CLI). Somente o
    // status vai para o log, nunca os dados pessoais.
    if (status === 400 || status === 409) {
      this.logger.warn(`Core API recusou a conversão da conta em membro (${status}).`);

      return null;
    }

    const parsed = enrolledMemberSchema.safeParse(body);

    if (status >= 300 || !parsed.success) {
      throw new Error(`Core API respondeu ${status} ao converter a conta em membro.`);
    }

    return parsed.data.person.id;
  }
}
