import { setTimeout as sleep } from 'node:timers/promises';
import { Inject, Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface CoreApiRequest {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  // Caminho relativo a /api/v1 da Core API, ex.: congregations/<id>/activate.
  path: string;
  query?: Record<string, string>;
  body?: unknown;
}

export interface CoreApiResponse {
  status: number;
  contentType: string;
  body: unknown;
}

// Core API inacessível, lenta além do timeout ou com resposta que não é JSON.
export class CoreApiUnavailableError extends Error {
  constructor(cause: unknown) {
    super('Core API indisponível.', { cause });
  }
}

// Abaixo dos 70 s do frontend e dos 100 s do Cloudflare, com folga para repetir a chamada original.
const WAKE_DEADLINE_MS = 50_000;

const WAKE_ATTEMPT_TIMEOUT_MS = 15_000;

const WAKE_RETRY_DELAY_MS = 2_000;

// Health recente dispensa nova verificação: evita uma chamada à Core API por aba aberta.
const AWAKE_TTL_MS = 30_000;

@Injectable()
export class CoreApiClient implements OnApplicationBootstrap {
  private readonly logger = new Logger(CoreApiClient.name);

  private readonly baseUrl: URL;

  private readonly token: string;

  private readonly timeoutMs: number;

  private pendingWake: Promise<boolean> | null = null;

  private awakeAt = 0;

  constructor(@Inject(ConfigService) configService: ConfigService) {
    this.baseUrl = new URL('/api/v1/', configService.getOrThrow<string>('CORE_API_URL'));

    this.token = configService.getOrThrow<string>('CORE_API_TOKEN');

    this.timeoutMs = configService.getOrThrow<number>('CORE_API_TIMEOUT_MS');
  }

  // Quando o BFF sobe (em geral, o primeiro acesso depois do repouso), já acorda a Core API em
  // paralelo, sem bloquear a inicialização.
  onApplicationBootstrap(): void {
    void this.wake();
  }

  send(request: CoreApiRequest): Promise<CoreApiResponse> {
    return this.request(request, this.timeoutMs);
  }

  // No Render Free, BFF e Core API entram em repouso sem uso, cada um no seu tempo. Enquanto a Core
  // API acorda, as chamadas falham, demoram ou recebem 5xx do Render. Chama o health dela até
  // responder ou até o prazo, com uma única verificação em andamento por vez. true se acordou.
  wake(): Promise<boolean> {
    if (Date.now() - this.awakeAt < AWAKE_TTL_MS) {
      return Promise.resolve(true);
    }

    this.pendingWake ??= this.pollHealth().finally(() => {
      this.pendingWake = null;
    });

    return this.pendingWake;
  }

  private async pollHealth(): Promise<boolean> {
    const deadline = Date.now() + WAKE_DEADLINE_MS;

    // oxlint-disable-next-line no-await-in-loop -- tentativas sucessivas até a Core API responder
    while (!(await this.isHealthy(deadline))) {
      if (Date.now() + WAKE_RETRY_DELAY_MS >= deadline) {
        this.logger.warn(
          'Core API não acordou dentro do prazo; a próxima chamada tentará de novo.',
        );

        return false;
      }

      // oxlint-disable-next-line no-await-in-loop -- intervalo entre as tentativas
      await sleep(WAKE_RETRY_DELAY_MS);
    }

    this.awakeAt = Date.now();

    this.logger.log('Core API acordada.');

    return true;
  }

  private async isHealthy(deadline: number): Promise<boolean> {
    const timeoutMs = Math.max(1000, Math.min(WAKE_ATTEMPT_TIMEOUT_MS, deadline - Date.now()));

    try {
      const { status } = await this.request({ method: 'GET', path: 'health' }, timeoutMs);

      return status === 200;
    } catch {
      return false;
    }
  }

  private async request(
    { body, method, path, query }: CoreApiRequest,
    timeoutMs: number,
  ): Promise<CoreApiResponse> {
    const url = new URL(path, this.baseUrl);

    for (const [key, value] of Object.entries(query ?? {})) {
      url.searchParams.set(key, value);
    }

    try {
      const response = await fetch(url, {
        method,
        headers: {
          Accept: 'application/json, application/problem+json',
          Authorization: `Bearer ${this.token}`,
          ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        signal: AbortSignal.timeout(timeoutMs),
      });

      const text = await response.text();

      return {
        status: response.status,
        contentType: response.headers.get('content-type') ?? 'application/json',
        body: text === '' ? null : (JSON.parse(text) as unknown),
      };
    } catch (error) {
      throw new CoreApiUnavailableError(error);
    }
  }
}
