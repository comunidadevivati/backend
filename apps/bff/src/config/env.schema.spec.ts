import { describe, expect, it } from 'vitest';
import { validateEnv } from './env.schema.js';

const validEnv = {
  NODE_ENV: 'test',
  BFF_PORT: '3001',
  BFF_BASE_URL: 'http://localhost:3001',
  WEB_BASE_URL: 'http://localhost:5173',
  COOKIE_SECRET: 'a'.repeat(32),
  DATABASE_URL: 'postgresql://usuario:senha@localhost:5432/comunidade_viva',
  EMAIL_PROVIDER: 'disabled',
  CORE_API_URL: 'http://localhost:3001',
  CORE_API_TOKEN: 'b'.repeat(32),
};

const validateInvalidEnv = () =>
  validateEnv({ ...validEnv, COOKIE_SECRET: 'curto', DATABASE_URL: 'nao-e-url' });

describe('validateEnv', () => {
  it('deve aceitar e converter uma configuração válida', () => {
    expect(validateEnv(validEnv)).toMatchObject({ NODE_ENV: 'test', BFF_PORT: 3001 });
  });

  it('deve aplicar development como NODE_ENV padrão', () => {
    expect(validateEnv({ ...validEnv, NODE_ENV: undefined }).NODE_ENV).toBe('development');
  });

  it('deve aceitar o esquema postgres:// usado pelos provedores gerenciados', () => {
    expect(
      validateEnv({ ...validEnv, DATABASE_URL: 'postgres://u:s@host/db?sslmode=require' }),
    ).toMatchObject({ DATABASE_URL: 'postgres://u:s@host/db?sslmode=require' });
  });

  it('deve exigir remetente e chave quando o Resend estiver habilitado', () => {
    expect(() => validateEnv({ ...validEnv, EMAIL_PROVIDER: 'resend' })).toThrow(
      'Invalid environment configuration: RESEND_API_KEY, EMAIL_FROM',
    );

    expect(
      validateEnv({
        ...validEnv,
        EMAIL_PROVIDER: 'resend',
        RESEND_API_KEY: 're_teste',
        EMAIL_FROM: 'Segurança <seguranca@mail.exemplo.com>',
      }),
    ).toMatchObject({
      EMAIL_PROVIDER: 'resend',
      PASSWORD_RESET_TTL_MINUTES: 15,
      PASSWORD_RESET_COOLDOWN_SECONDS: 60,
      EMAIL_VERIFICATION_TTL_HOURS: 24,
      EMAIL_VERIFICATION_COOLDOWN_SECONDS: 60,
      EMAIL_SEND_TIMEOUT_MS: 5000,
    });
  });

  it('deve exigir a Core API com credencial de serviço e aplicar o timeout padrão', () => {
    expect(validateEnv(validEnv)).toMatchObject({ CORE_API_TIMEOUT_MS: 30_000 });

    expect(() =>
      validateEnv({ ...validEnv, CORE_API_URL: 'ftp://core', CORE_API_TOKEN: 'curto' }),
    ).toThrow('Invalid environment configuration: CORE_API_URL, CORE_API_TOKEN');
  });

  it('deve rejeitar URLs de banco que não sejam PostgreSQL', () => {
    expect(() => validateEnv({ ...validEnv, DATABASE_URL: 'mysql://u:s@host/db' })).toThrow(
      'Invalid environment configuration: DATABASE_URL',
    );
  });

  it('deve listar as variáveis inválidas sem expor seus valores', () => {
    expect(validateInvalidEnv).toThrow(
      'Invalid environment configuration: COOKIE_SECRET, DATABASE_URL',
    );

    expect(validateInvalidEnv).not.toThrow(/curto/u);
  });
});
