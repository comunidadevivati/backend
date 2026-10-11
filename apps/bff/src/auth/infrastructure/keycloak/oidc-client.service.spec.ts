import { allowInsecureRequests } from 'openid-client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { OidcClientService } from './oidc-client.service.js';
import type { ConfigService } from '@nestjs/config';

const oidcMock = vi.hoisted(() => ({
  configuration: { issuer: 'mock' },
  discovery: vi.fn(),
}));

vi.mock('openid-client', () => ({
  allowInsecureRequests: vi.fn(),
  ClientSecretPost: vi.fn(),
  discovery: oidcMock.discovery,
}));

const createService = (nodeEnv: string, issuer: string) => {
  const values: Record<string, string> = {
    KEYCLOAK_ISSUER: issuer,
    KEYCLOAK_CLIENT_ID: 'bff',
    KEYCLOAK_CLIENT_SECRET: 'segredo',
    NODE_ENV: nodeEnv,
  };

  const configService = {
    getOrThrow: (key: string) => values[key],
  } as unknown as ConfigService;

  return new OidcClientService(configService);
};

const getDiscoveryOptions = () => oidcMock.discovery.mock.calls[0]?.[4] as { execute: unknown[] };

describe('OidcClientService', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    oidcMock.discovery.mockResolvedValue(oidcMock.configuration);
  });

  it('deve descobrir e expor a configuração do emissor', async () => {
    const service = createService('production', 'https://auth.example.com/realms/cv');

    await service.onModuleInit();

    expect(oidcMock.discovery).toHaveBeenCalledWith(
      new URL('https://auth.example.com/realms/cv'),
      'bff',
      undefined,
      undefined,
      { execute: [] },
    );

    expect(service.getConfiguration()).toBe(oidcMock.configuration);
  });

  it('deve permitir HTTP apenas para localhost em desenvolvimento', async () => {
    await createService('development', 'http://localhost:8080/realms/cv').onModuleInit();

    expect(getDiscoveryOptions().execute).toEqual([allowInsecureRequests]);
  });

  it('não deve permitir HTTP fora de desenvolvimento', async () => {
    await createService('production', 'http://localhost:8080/realms/cv').onModuleInit();

    expect(getDiscoveryOptions().execute).toEqual([]);
  });

  it('não deve permitir HTTP para hosts remotos', async () => {
    await createService('development', 'http://keycloak:8080/realms/cv').onModuleInit();

    expect(getDiscoveryOptions().execute).toEqual([]);
  });
});
