import { Controller, Get, Header, Inject, Res } from '@nestjs/common';
import { DatabaseService } from '../../shared/infrastructure/database/database.service.js';
import { CoreApiClient } from '../infrastructure/core-api.client.js';
import type { FastifyReply } from 'fastify';

type ServiceStatus = 'ok' | 'unavailable';

interface WakeResponse {
  database: ServiceStatus;
  coreApi: ServiceStatus;
}

const toStatus = (awake: boolean): ServiceStatus => (awake ? 'ok' : 'unavailable');

// Chamado pelo frontend ao abrir o site: a própria requisição acorda o BFF, que acorda em paralelo
// o PostgreSQL e a Core API. Sem sessão e sem dados; responde 503 se algum não acordou no prazo,
// para o cliente tentar de novo.
@Controller('api/v1/wake')
export class WakeController {
  constructor(
    @Inject(CoreApiClient) private readonly coreApi: CoreApiClient,
    @Inject(DatabaseService) private readonly database: DatabaseService,
  ) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  async wake(@Res({ passthrough: true }) reply: FastifyReply): Promise<WakeResponse> {
    const [database, coreApi] = await Promise.all([this.database.ping(), this.coreApi.wake()]);

    void reply.status(database && coreApi ? 200 : 503);

    return { database: toStatus(database), coreApi: toStatus(coreApi) };
  }
}
