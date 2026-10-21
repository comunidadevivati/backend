import {
  BadGatewayException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { SessionCookieService } from '../../auth/presentation/session-cookie.service.js';
import {
  CoreApiClient,
  CoreApiUnavailableError,
  type CoreApiRequest,
} from '../infrastructure/core-api.client.js';
import type { FastifyReply, FastifyRequest } from 'fastify';

export interface ForwardOptions extends CoreApiRequest {
  // Operações que alteram estado exigem também o header X-CSRF-Token.
  write: boolean;
}

// Encaminha à Core API as rotas de negócio do frontend (/api/v1/*). Regra provisória do MVP:
// basta uma sessão válida com e-mail verificado; papéis e permissões ainda não existem.
@Injectable()
export class CoreApiForwarder {
  private readonly logger = new Logger(CoreApiForwarder.name);

  constructor(
    @Inject(SessionCookieService)
    private readonly sessionCookies: SessionCookieService,
    @Inject(CoreApiClient)
    private readonly coreApi: CoreApiClient,
  ) {}

  async forward(
    request: FastifyRequest,
    reply: FastifyReply,
    { write, ...call }: ForwardOptions,
  ): Promise<unknown> {
    const { session } = await this.sessionCookies.requireSession(request);

    if (!session.emailVerified) {
      throw new ForbiddenException('Confirme seu e-mail para acessar este recurso.');
    }

    if (write) {
      this.sessionCookies.assertCsrfToken(request, session);
    }

    return this.relay(reply, call);
  }

  // Leitura do site público: sem sessão, somente GET. A Core API decide o que é público.
  forwardPublic(
    reply: FastifyReply,
    call: Omit<CoreApiRequest, 'method' | 'body'>,
  ): Promise<unknown> {
    return this.relay(reply, { ...call, method: 'GET' });
  }

  private async relay(reply: FastifyReply, call: CoreApiRequest): Promise<unknown> {
    let response;

    try {
      response = await this.coreApi.send(call);
    } catch (error) {
      if (error instanceof CoreApiUnavailableError) {
        this.logger.error(`Core API indisponível em ${call.method} ${call.path}.`);

        throw new ServiceUnavailableException('Serviço temporariamente indisponível.');
      }

      throw error;
    }

    // 401 da Core API é falha da credencial de serviço, não da sessão do usuário: repassá-lo
    // faria o frontend encerrar a sessão. Falhas internas também não são repassadas.
    if (response.status === 401 || response.status >= 500) {
      this.logger.error(`Core API respondeu ${response.status} em ${call.method} ${call.path}.`);

      throw new BadGatewayException('Falha ao processar a solicitação.');
    }

    void reply.status(response.status).header('Content-Type', response.contentType);

    return response.body;
  }
}
