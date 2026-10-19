import { NotFoundException, type ArgumentsHost, type ExecutionContext } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { validateEnv } from '../../config/env.schema.js';
import { ProblemDetailsFilter, ProblemException } from './problem-details.js';
import { ServiceTokenGuard } from './service-token.guard.js';
import type { ConfigService } from '@nestjs/config';

const TOKEN = 't'.repeat(32);

const contextWith = (authorization?: string) =>
  ({
    switchToHttp: () => ({ getRequest: () => ({ headers: { authorization } }) }),
  }) as unknown as ExecutionContext;

describe('ServiceTokenGuard', () => {
  const guard = new ServiceTokenGuard({ getOrThrow: () => TOKEN } as unknown as ConfigService);

  it('deve aceitar somente o token de serviço configurado', () => {
    expect(guard.canActivate(contextWith(`Bearer ${TOKEN}`))).toBe(true);
  });

  it.each([undefined, TOKEN, 'Bearer outro-token', `Basic ${TOKEN}`])(
    'deve recusar %s com 401',
    (header) => {
      expect(() => guard.canActivate(contextWith(header))).toThrow(ProblemException);
    },
  );
});

const hostFor = () => {
  const reply = { status: vi.fn(), header: vi.fn(), send: vi.fn() };

  reply.status.mockReturnValue(reply);

  reply.header.mockReturnValue(reply);

  const host = {
    switchToHttp: () => ({ getResponse: () => reply }),
  } as unknown as ArgumentsHost;

  return { host, reply };
};

describe('ProblemDetailsFilter', () => {
  const filter = new ProblemDetailsFilter();

  it('deve servir o ProblemException como application/problem+json', () => {
    const { host, reply } = hostFor();

    filter.catch(new ProblemException(400, 'Dados inválidos.', ['cnpj']), host);

    expect(reply.status).toHaveBeenCalledWith(400);

    expect(reply.header).toHaveBeenCalledWith(
      'Content-Type',
      'application/problem+json; charset=utf-8',
    );

    expect(reply.send).toHaveBeenCalledWith({
      type: 'about:blank',
      title: 'Requisição inválida',
      status: 400,
      detail: 'Dados inválidos.',
      fields: ['cnpj'],
    });
  });

  it('deve converter as exceções HTTP do NestJS', () => {
    const { host, reply } = hostFor();

    filter.catch(new NotFoundException('Cannot GET /x'), host);

    expect(reply.send).toHaveBeenCalledWith({
      type: 'about:blank',
      title: 'Recurso não encontrado',
      status: 404,
      detail: 'Cannot GET /x',
    });
  });

  it('não deve expor detalhes de falhas inesperadas', () => {
    const { host, reply } = hostFor();

    filter.catch(new Error('senha do banco no erro'), host);

    expect(reply.send).toHaveBeenCalledWith({
      type: 'about:blank',
      title: 'Erro interno',
      status: 500,
    });
  });
});

describe('validateEnv', () => {
  const env = { DATABASE_URL: 'postgres://u:s@localhost/db', CORE_API_TOKEN: TOKEN };

  it('deve aplicar os padrões de ambiente e porta', () => {
    expect(validateEnv(env)).toMatchObject({ NODE_ENV: 'development', PORT: 3001 });
  });

  it('deve listar as variáveis inválidas sem expor os valores', () => {
    expect(() => validateEnv({ DATABASE_URL: 'mysql://x', CORE_API_TOKEN: 'curto' })).toThrow(
      'Invalid environment configuration: DATABASE_URL, CORE_API_TOKEN',
    );
  });
});
