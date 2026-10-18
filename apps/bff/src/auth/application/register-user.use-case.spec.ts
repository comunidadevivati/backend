import { describe, expect, it, vi } from 'vitest';
import { RegisterUserUseCase } from './register-user.use-case.js';
import type { SessionService } from '../infrastructure/session/session.service.js';
import type { UserRepository } from '../infrastructure/users/user.repository.js';

vi.mock('../infrastructure/password/password-hasher.js', () => ({
  hashPassword: vi.fn(() => Promise.resolve('scrypt$hash')),
}));

const command = {
  name: 'Maria da Silva',
  phone: '67991234567',
  email: 'maria@exemplo.com',
  password: 'Diversos@@2026',
};

const createUseCase = (create: () => Promise<string>) => {
  const createMock = vi.fn(create);

  const createSession = vi.fn(() =>
    Promise.resolve({ token: 'token-de-sessao', csrfToken: 'csrf-token' }),
  );

  return {
    create: createMock,
    createSession,
    useCase: new RegisterUserUseCase(
      { create: createMock } as unknown as UserRepository,
      { createSession } as unknown as SessionService,
    ),
  };
};

describe('RegisterUserUseCase — conta criada', () => {
  it('deve gravar somente o hash da senha e abrir a sessão do novo usuário', async () => {
    const { create, createSession, useCase } = createUseCase(() => Promise.resolve('usuario-1'));

    await expect(useCase.execute(command)).resolves.toEqual({
      status: 'created',
      session: {
        sessionToken: 'token-de-sessao',
        csrfToken: 'csrf-token',
        user: { id: 'usuario-1', email: 'maria@exemplo.com', name: 'Maria da Silva' },
      },
    });

    expect(create).toHaveBeenCalledWith({
      name: 'Maria da Silva',
      phone: '67991234567',
      email: 'maria@exemplo.com',
      passwordHash: 'scrypt$hash',
    });

    expect(createSession).toHaveBeenCalledWith('usuario-1');
  });
});

describe('RegisterUserUseCase — falhas', () => {
  it('deve informar e-mail já cadastrado sem abrir sessão', async () => {
    const violation = new Error('insert failed', { cause: { code: '23505' } });

    const { createSession, useCase } = createUseCase(() => Promise.reject(violation));

    await expect(useCase.execute(command)).resolves.toEqual({ status: 'email_taken' });

    expect(createSession).not.toHaveBeenCalled();
  });

  it('deve propagar outras falhas do banco', async () => {
    const { useCase } = createUseCase(() => Promise.reject(new Error('conexão perdida')));

    await expect(useCase.execute(command)).rejects.toThrow('conexão perdida');
  });
});
