import { afterEach, describe, expect, it, vi } from 'vitest';
import { CoreApiClient, CoreApiUnavailableError } from './core-api.client.js';
import type { ConfigService } from '@nestjs/config';

const config: Record<string, unknown> = {
  CORE_API_URL: 'http://core-api:10000',
  CORE_API_TOKEN: 'token-de-servico',
  CORE_API_TIMEOUT_MS: 5000,
};

const client = new CoreApiClient({
  getOrThrow: (key: string) => config[key],
} as unknown as ConfigService);

const mockFetch = (response: Response | Error) => {
  const fetchMock = vi.fn(() =>
    response instanceof Error ? Promise.reject(response) : Promise.resolve(response),
  );

  vi.stubGlobal('fetch', fetchMock);

  return fetchMock;
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('CoreApiClient', () => {
  it('deve chamar /api/v1 com a credencial de serviço, filtros e corpo JSON', async () => {
    const fetchMock = mockFetch(
      new Response('{"status":"ACTIVE"}', {
        status: 200,
        headers: { 'content-type': 'application/json; charset=utf-8' },
      }),
    );

    await expect(
      client.send({
        method: 'PATCH',
        path: 'congregations/abc',
        query: { limit: '5' },
        body: { version: 1 },
      }),
    ).resolves.toEqual({
      status: 200,
      contentType: 'application/json; charset=utf-8',
      body: { status: 'ACTIVE' },
    });

    const [url, init] = fetchMock.mock.lastCall as unknown as [URL, RequestInit];

    expect(url.toString()).toBe('http://core-api:10000/api/v1/congregations/abc?limit=5');

    expect(init).toMatchObject({
      method: 'PATCH',
      body: '{"version":1}',
      headers: {
        Authorization: 'Bearer token-de-servico',
        'Content-Type': 'application/json',
      },
    });
  });

  it('deve aceitar respostas sem corpo e sem Content-Type', async () => {
    const fetchMock = mockFetch(new Response(null, { status: 204 }));

    await expect(client.send({ method: 'POST', path: 'organization/activate' })).resolves.toEqual({
      status: 204,
      contentType: 'application/json',
      body: null,
    });

    const [, init] = fetchMock.mock.lastCall as unknown as [URL, RequestInit];

    expect(init.headers).not.toHaveProperty('Content-Type');
  });

  it.each([
    ['falha de rede ou timeout', new TypeError('fetch failed')],
    ['corpo que não é JSON', new Response('<html>', { status: 502 })],
  ])('deve sinalizar indisponibilidade em %s', async (_caso, response) => {
    mockFetch(response);

    await expect(client.send({ method: 'GET', path: 'organization' })).rejects.toBeInstanceOf(
      CoreApiUnavailableError,
    );
  });
});
