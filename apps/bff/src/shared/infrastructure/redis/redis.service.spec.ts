import { Logger } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RedisService } from './redis.service.js';
import type { ConfigService } from '@nestjs/config';

const redisMock = vi.hoisted(() => ({
  client: {
    isOpen: false,
    on: vi.fn(),
    connect: vi.fn(() => Promise.resolve()),
    close: vi.fn(() => Promise.resolve()),
  },
  createClient: vi.fn(),
}));

vi.mock('redis', () => ({ createClient: redisMock.createClient }));

interface ClientOptions {
  url: string;
  socket: { reconnectStrategy: (retries: number) => number | false };
}

const configService = {
  getOrThrow: vi.fn(() => 'redis://localhost:6379'),
} as unknown as ConfigService;

const createService = () => new RedisService(configService);

const getClientOptions = (): ClientOptions =>
  redisMock.createClient.mock.calls[0]?.[0] as ClientOptions;

const resetMocks = () => {
  vi.clearAllMocks();

  redisMock.client.isOpen = false;

  redisMock.createClient.mockReturnValue(redisMock.client);

  vi.spyOn(Logger.prototype, 'log').mockImplementation(vi.fn());

  vi.spyOn(Logger.prototype, 'error').mockImplementation(vi.fn());
};

describe('RedisService — cliente', () => {
  beforeEach(resetMocks);

  it('deve criar o cliente com a URL configurada', () => {
    const service = createService();

    expect(getClientOptions().url).toBe('redis://localhost:6379');

    expect(service.getClient()).toBe(redisMock.client);
  });

  it('deve aplicar backoff limitado e desistir após 5 tentativas', () => {
    createService();

    const { reconnectStrategy } = getClientOptions().socket;

    expect(reconnectStrategy(1)).toBe(200);

    expect(reconnectStrategy(4)).toBe(800);

    expect(reconnectStrategy(5)).toBe(false);
  });

  it('deve registrar erros do cliente', () => {
    createService();

    const [event, handler] = redisMock.client.on.mock.calls[0] as unknown as [
      string,
      (error: Error) => void,
    ];

    expect(event).toBe('error');

    handler(new Error('falha'));

    expect(Logger.prototype.error).toHaveBeenCalledWith('Redis: falha');
  });
});

describe('RedisService — ciclo de vida', () => {
  beforeEach(resetMocks);

  it('deve conectar na inicialização do módulo', async () => {
    await createService().onModuleInit();

    expect(redisMock.client.connect).toHaveBeenCalledOnce();
  });

  it('deve fechar a conexão aberta na destruição do módulo', async () => {
    redisMock.client.isOpen = true;

    await createService().onModuleDestroy();

    expect(redisMock.client.close).toHaveBeenCalledOnce();
  });

  it('não deve fechar uma conexão já encerrada', async () => {
    await createService().onModuleDestroy();

    expect(redisMock.client.close).not.toHaveBeenCalled();
  });
});
