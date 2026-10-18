import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LoginUseCase } from './login.use-case.js';
import type { SessionService } from '../infrastructure/session/session.service.js';
import type { UserCredentials, UserRepository } from '../infrastructure/users/user.repository.js';

const passwordMocks = vi.hoisted(() => ({
  hashPassword: vi.fn(),
  verifyPassword: vi.fn(),
}));

vi.mock('../infrastructure/password/password-hasher.js', () => passwordMocks);

const activeUser: UserCredentials = {
  id: '0199f0a0-0000-7000-8000-000000000001',
  email: 'usuario@exemplo.com',
  name: 'Usuário Exemplo',
  passwordHash: 'scrypt$hash-armazenado',
  status: 'ACTIVE',
  emailVerifiedAt: null,
};

const createFixture = (user: UserCredentials | null) => {
  const findByEmail = vi.fn(() => Promise.resolve(user));

  const createSession = vi.fn(() =>
    Promise.resolve({ token: 'token-de-sessao', csrfToken: 'csrf-token' }),
  );

  const useCase = new LoginUseCase(
    { findByEmail } as unknown as UserRepository,
    { createSession } as unknown as SessionService,
  );

  return { createSession, findByEmail, useCase };
};

beforeEach(() => {
  passwordMocks.hashPassword.mockReset().mockResolvedValue('scrypt$hash-ficticio');

  passwordMocks.verifyPassword.mockReset();
});

describe('LoginUseCase — sucesso', () => {
  it('deve criar sessão para credenciais válidas de usuário ativo', async () => {
    passwordMocks.verifyPassword.mockResolvedValue(true);

    const { createSession, findByEmail, useCase } = createFixture(activeUser);

    await expect(
      useCase.execute({ email: 'Usuario@Exemplo.com', password: 'senha-correta' }),
    ).resolves.toEqual({
      sessionToken: 'token-de-sessao',
      csrfToken: 'csrf-token',
      user: {
        id: activeUser.id,
        email: 'usuario@exemplo.com',
        name: 'Usuário Exemplo',
        emailVerified: false,
      },
    });

    expect(findByEmail).toHaveBeenCalledWith('Usuario@Exemplo.com');

    expect(passwordMocks.verifyPassword).toHaveBeenCalledWith(
      'senha-correta',
      'scrypt$hash-armazenado',
    );

    expect(createSession).toHaveBeenCalledWith(activeUser.id);
  });
});

describe('LoginUseCase — falhas', () => {
  it('deve recusar senha incorreta sem criar sessão', async () => {
    passwordMocks.verifyPassword.mockResolvedValue(false);

    const { createSession, useCase } = createFixture(activeUser);

    await expect(useCase.execute({ email: activeUser.email, password: 'errada' })).resolves.toBe(
      null,
    );

    expect(createSession).not.toHaveBeenCalled();
  });

  it('deve recusar usuário suspenso mesmo com a senha correta', async () => {
    passwordMocks.verifyPassword.mockResolvedValue(true);

    const { createSession, useCase } = createFixture({ ...activeUser, status: 'SUSPENDED' });

    await expect(useCase.execute({ email: activeUser.email, password: 'senha' })).resolves.toBe(
      null,
    );

    expect(createSession).not.toHaveBeenCalled();
  });

  it('deve verificar um hash fictício quando o e-mail não existir', async () => {
    passwordMocks.verifyPassword.mockResolvedValue(false);

    const { createSession, useCase } = createFixture(null);

    await expect(useCase.execute({ email: 'x@exemplo.com', password: 'a' })).resolves.toBe(null);

    await expect(useCase.execute({ email: 'y@exemplo.com', password: 'b' })).resolves.toBe(null);

    expect(passwordMocks.hashPassword).toHaveBeenCalledTimes(1);

    expect(passwordMocks.verifyPassword).toHaveBeenCalledWith('a', 'scrypt$hash-ficticio');

    expect(createSession).not.toHaveBeenCalled();
  });
});
