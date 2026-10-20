import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface CoreApiRequest {
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE';
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

@Injectable()
export class CoreApiClient {
  private readonly baseUrl: URL;

  private readonly token: string;

  private readonly timeoutMs: number;

  constructor(@Inject(ConfigService) configService: ConfigService) {
    this.baseUrl = new URL('/api/v1/', configService.getOrThrow<string>('CORE_API_URL'));

    this.token = configService.getOrThrow<string>('CORE_API_TOKEN');

    this.timeoutMs = configService.getOrThrow<number>('CORE_API_TIMEOUT_MS');
  }

  async send({ body, method, path, query }: CoreApiRequest): Promise<CoreApiResponse> {
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
        signal: AbortSignal.timeout(this.timeoutMs),
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
