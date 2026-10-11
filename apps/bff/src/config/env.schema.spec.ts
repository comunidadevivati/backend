import { describe, expect, it } from 'vitest';
import { validateEnv } from './env.schema.js';

const validEnv = {
  NODE_ENV: 'test',
  BFF_PORT: '3001',
  BFF_BASE_URL: 'http://localhost:3001',
  BFF_OIDC_CALLBACK_URL: 'http://localhost:3001/auth/callback',
  WEB_BASE_URL: 'http://localhost:5173',
  KEYCLOAK_ISSUER: 'http://localhost:8080/realms/comvivati',
  KEYCLOAK_CLIENT_ID: 'bff',
  KEYCLOAK_CLIENT_SECRET: 'segredo-de-teste',
  COOKIE_SECRET: 'a'.repeat(32),
  SESSION_ENCRYPTION_KEY: 'A'.repeat(43),
  REDIS_URL: 'redis://localhost:6379',
};

const validateInvalidEnv = () =>
  validateEnv({ ...validEnv, COOKIE_SECRET: 'curto', REDIS_URL: 'nao-e-url' });

describe('validateEnv', () => {
  it('deve aceitar e converter uma configuração válida', () => {
    expect(validateEnv(validEnv)).toMatchObject({ NODE_ENV: 'test', BFF_PORT: 3001 });
  });

  it('deve aplicar development como NODE_ENV padrão', () => {
    expect(validateEnv({ ...validEnv, NODE_ENV: undefined }).NODE_ENV).toBe('development');
  });

  it('deve listar as variáveis inválidas sem expor seus valores', () => {
    expect(validateInvalidEnv).toThrow(
      'Invalid environment configuration: COOKIE_SECRET, REDIS_URL',
    );

    expect(validateInvalidEnv).not.toThrow(/curto/u);
  });
});
