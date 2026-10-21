import { Inject, Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';
import { CoreApiClient } from './core-api.client.js';

// No Render Free, BFF e Core API entram em repouso sem uso. Quando o BFF acorda (primeiro acesso,
// em geral o login), já acorda a Core API em paralelo: a primeira tela de dados não espera pelo
// cold start inteiro. Não bloqueia a inicialização nem falha se a Core API não responder.
@Injectable()
export class CoreApiWarmup implements OnApplicationBootstrap {
  private readonly logger = new Logger(CoreApiWarmup.name);

  constructor(@Inject(CoreApiClient) private readonly coreApi: CoreApiClient) {}

  // Sem await: a inicialização segue enquanto a Core API acorda.
  onApplicationBootstrap(): void {
    void this.warm();
  }

  private async warm(): Promise<void> {
    try {
      const { status } = await this.coreApi.send({ method: 'GET', path: 'health' });

      this.logger.log(`Core API acordada (status ${status}).`);
    } catch {
      this.logger.warn('Core API não respondeu ao aquecimento; as rotas tentarão de novo.');
    }
  }
}
