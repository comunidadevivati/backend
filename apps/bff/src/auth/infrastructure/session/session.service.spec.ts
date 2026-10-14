import { randomBytes } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { SessionService, type AuthSession } from './session.service.js';
import type { RedisService } from '../../../shared/infrastructure/redis/redis.service.js';
import type { ConfigService } from '@nestjs/config';

const sessionData: AuthSession = {
  subject: 'usuario-123',
  csrfToken: 'csrf-token-teste',
  accessToken: 'access-token-teste',
  refreshToken: 'refresh-token-teste',
  idToken: 'id-token-teste',
  accessTokenExpiresAt: 1800000000,
  createdAt: 1799999700,
};

const createFixture = () => {
  const storage = new Map<string, string>();

  const encryptionKey = randomBytes(32).toString('base64url');

  const client = {
    set: vi.fn((key: string, value: string) => {
      storage.set(key, value);

      return Promise.resolve('OK');
    }),
    get: vi.fn((key: string) => Promise.resolve(storage.get(key) ?? null)),
    del: vi.fn((key: string) => Promise.resolve(storage.delete(key) ? 1 : 0)),
  };

  const redisService = {
    getClient: () => client,
  } as unknown as RedisService;

  const configService = {
    getOrThrow: (key: string) => {
      if (key === 'SESSION_ENCRYPTION_KEY') {
        return encryptionKey;
      }

      throw new Error(`Configuração desconhecida: ${key}`);
    },
  } as ConfigService;

  const service = new SessionService(redisService, configService);

  return { service, client, storage };
};

describe('SessionService — criação', () => {
  it('deve criar uma sessão com identificador seguro', async () => {
    const { service } = createFixture();

    const sessionId = await service.createSession(sessionData);

    expect(sessionId).toMatch(/^[A-Za-z0-9_-]{43}$/u);
  });

  it('deve armazenar a sessão criptografada no Redis', async () => {
    const { service, storage } = createFixture();

    await service.createSession(sessionData);

    expect([...storage.values()][0]).not.toContain(sessionData.accessToken);
  });

  it('deve configurar o TTL de 1800 segundos', async () => {
    const { service, client } = createFixture();

    await service.createSession(sessionData);

    expect(client.set).toHaveBeenCalledWith(
      expect.stringContaining('comvivati:bff:session:'),
      expect.any(String),
      { EX: 1800 },
    );
  });
});

describe('SessionService — recuperação', () => {
  it('deve recuperar a sessão descriptografada', async () => {
    const { service } = createFixture();

    const sessionId = await service.createSession(sessionData);

    expect(await service.getSession(sessionId)).toEqual(sessionData);
  });

  it('deve rejeitar identificadores inválidos', async () => {
    const { service } = createFixture();

    expect(await service.getSession('identificador-invalido')).toBeNull();
  });

  it('deve rejeitar dados criptografados adulterados', async () => {
    const { service, storage } = createFixture();

    const sessionId = await service.createSession(sessionData);

    storage.set(`comvivati:bff:session:${sessionId}`, 'conteudo-adulterado');

    await expect(service.getSession(sessionId)).rejects.toThrow();
  });
});

describe('SessionService — exclusão', () => {
  it('deve excluir a sessão no logout', async () => {
    const { service } = createFixture();

    const sessionId = await service.createSession(sessionData);

    await service.deleteSession(sessionId);

    expect(await service.getSession(sessionId)).toBeNull();
  });
});

describe('SessionService — validações adicionais', () => {
  it('deve rejeitar uma chave de criptografia inválida', () => {
    const redis = {
      getClient: vi.fn(),
    } as unknown as RedisService;

    const config = {
      getOrThrow: vi.fn(() => 'chave-invalida'),
    } as unknown as ConfigService;

    expect(() => new SessionService(redis, config)).toThrow(
      'SESSION_ENCRYPTION_KEY deve conter 32 bytes.',
    );
  });

  it('deve ignorar a exclusão de identificadores inválidos', async () => {
    const { service, client } = createFixture();

    await service.deleteSession('identificador-invalido');

    expect(client.del).not.toHaveBeenCalled();
  });

  it('deve rejeitar uma sessão com partes incompletas', async () => {
    const { service, storage } = createFixture();

    const sessionId = await service.createSession(sessionData);

    storage.set(`comvivati:bff:session:${sessionId}`, '.assinatura.conteudo');

    await expect(service.getSession(sessionId)).rejects.toThrow('Dados da sessão incompletos.');
  });
});
