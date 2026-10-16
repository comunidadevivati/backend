import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { SessionService } from './session.service.js';
import type { DatabaseService } from '../../../shared/infrastructure/database/database.service.js';

interface RecordedCall {
  method: string;
  args: unknown[];
}

// Simula o query builder do Drizzle: registra a cadeia de chamadas e resolve cada consulta com o
// próximo resultado da fila. O SQL real é coberto pelo teste de integração com PostgreSQL.
const createDatabaseMock = (results: unknown[][] = []) => {
  const calls: RecordedCall[] = [];

  const queue = [...results];

  const chain: object = new Proxy(
    {},
    {
      get: (_target, property) => {
        if (property === 'then') {
          const result = queue.shift() ?? [];

          return (resolve: (value: unknown) => void) => {
            resolve(result);
          };
        }

        return (...args: unknown[]) => {
          calls.push({ method: String(property), args });

          return chain;
        };
      },
    },
  );

  return {
    calls,
    service: new SessionService({ db: chain } as unknown as DatabaseService),
  };
};

const validToken = 'A'.repeat(43);

const sha256 = (value: string) => createHash('sha256').update(value).digest('base64url');

describe('SessionService — criação', () => {
  it('deve gerar tokens aleatórios e persistir somente o hash do token', async () => {
    const { calls, service } = createDatabaseMock();

    const { csrfToken, token } = await service.createSession('usuario-1');

    expect(token).toMatch(/^[\w-]{43}$/u);

    expect(csrfToken).toMatch(/^[\w-]{43}$/u);

    expect(csrfToken).not.toBe(token);

    const values = calls.find(({ method }) => method === 'values')?.args[0];

    expect(values).toMatchObject({ tokenHash: sha256(token), userId: 'usuario-1', csrfToken });

    expect(JSON.stringify(calls.map(({ method }) => method))).toBe(
      JSON.stringify(['delete', 'where', 'insert', 'values']),
    );
  });
});

describe('SessionService — consulta', () => {
  it('deve retornar a sessão válida e renovar sua expiração', async () => {
    const session = {
      userId: 'usuario-1',
      email: 'usuario@exemplo.com',
      name: 'Usuário',
      csrfToken: 'csrf',
    };

    const { calls, service } = createDatabaseMock([[session]]);

    await expect(service.getSession(validToken)).resolves.toEqual(session);

    expect(calls.map(({ method }) => method)).toEqual([
      'update',
      'set',
      'from',
      'where',
      'returning',
    ]);
  });

  it('deve retornar null quando a sessão não existir, expirar ou o usuário estiver suspenso', async () => {
    const { service } = createDatabaseMock([[]]);

    await expect(service.getSession(validToken)).resolves.toBeNull();
  });

  it('deve recusar tokens em formato inválido sem consultar o banco', async () => {
    const { calls, service } = createDatabaseMock();

    await expect(service.getSession('curto')).resolves.toBeNull();

    expect(calls).toHaveLength(0);
  });
});

describe('SessionService — revogação', () => {
  it('deve remover a sessão pelo hash do token', async () => {
    const { calls, service } = createDatabaseMock();

    await service.deleteSession(validToken);

    expect(calls.map(({ method }) => method)).toEqual(['delete', 'where']);
  });

  it('deve ignorar tokens em formato inválido', async () => {
    const { calls, service } = createDatabaseMock();

    await service.deleteSession('token invalido');

    expect(calls).toHaveLength(0);
  });
});
