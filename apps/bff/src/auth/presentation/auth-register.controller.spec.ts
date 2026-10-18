import { describe, expect, it, vi } from 'vitest';
import { AuthController } from './auth.controller.js';
import { SessionCookieService } from './session-cookie.service.js';
import type { LoginUseCase } from '../application/login.use-case.js';
import type {
  RegisterUserResult,
  RegisterUserUseCase,
} from '../application/register-user.use-case.js';
import type { SessionService } from '../infrastructure/session/session.service.js';
import type { ConfigService } from '@nestjs/config';
import type { FastifyReply, FastifyRequest } from 'fastify';

const created: RegisterUserResult = {
  status: 'created',
  session: {
    sessionToken: 'token-de-sessao',
    csrfToken: 'csrf-token',
    user: { id: 'novo-usuario', email: 'maria@exemplo.com', name: 'Maria da Silva' },
  },
};

const createFixture = (registerResult: RegisterUserResult = created, previousCookie?: string) => {
  const executeRegister = vi.fn(() => Promise.resolve(registerResult));

  const deleteSession = vi.fn(() => Promise.resolve());

  const sessionService = { deleteSession } as unknown as SessionService;

  const controller = new AuthController(
    {} as LoginUseCase,
    { execute: executeRegister } as unknown as RegisterUserUseCase,
    sessionService,
    new SessionCookieService(sessionService, {
      getOrThrow: vi.fn(() => 'http://localhost:3000'),
    } as unknown as ConfigService),
  );

  const request = {
    cookies: previousCookie ? { comvivati_session: previousCookie } : {},
    unsignCookie: vi.fn(() => ({ valid: true, value: 'token-anterior' })),
  } as unknown as FastifyRequest;

  const reply = { setCookie: vi.fn() } as unknown as FastifyReply;

  return { controller, deleteSession, executeRegister, reply, request };
};

const validRegistration = {
  name: '  Maria   da Silva ',
  phone: '67991234567',
  email: ' Maria@Exemplo.com ',
  password: 'Diversos@@2026',
};

describe('AuthController — cadastro', () => {
  it('deve criar a conta normalizada e já abrir a sessão, como no login', async () => {
    const { controller, executeRegister, reply, request } = createFixture();

    await expect(controller.register(validRegistration, request, reply)).resolves.toEqual({
      authenticated: true,
      message: 'Usuário cadastrado com sucesso.',
      csrfToken: 'csrf-token',
      user: { subject: 'novo-usuario', email: 'maria@exemplo.com', name: 'Maria da Silva' },
    });

    expect(executeRegister).toHaveBeenCalledWith({
      name: 'Maria da Silva',
      phone: '67991234567',
      email: 'maria@exemplo.com',
      password: 'Diversos@@2026',
    });

    expect(reply.setCookie).toHaveBeenCalledWith(
      'comvivati_session',
      'token-de-sessao',
      expect.objectContaining({ httpOnly: true, signed: true, sameSite: 'lax', path: '/' }),
    );
  });

  it('deve revogar a sessão anterior do navegador ao cadastrar', async () => {
    const { controller, deleteSession, reply, request } = createFixture(created, 'cookie');

    await controller.register(validRegistration, request, reply);

    expect(deleteSession).toHaveBeenCalledWith('token-anterior');
  });

  it('deve responder conflito sem abrir sessão quando o e-mail já existir', async () => {
    const { controller, reply, request } = createFixture({ status: 'email_taken' });

    await expect(controller.register(validRegistration, request, reply)).rejects.toThrow(
      'Já existe uma conta com este e-mail.',
    );

    expect(reply.setCookie).not.toHaveBeenCalled();
  });
});

describe('AuthController — cadastro recusado', () => {
  it.each([
    ['nome sem sobrenome', { name: 'Maria' }, 'name'],
    ['telefone com DDD inexistente', { phone: '20991234567' }, 'phone'],
    ['e-mail inválido', { email: 'maria' }, 'email'],
    ['senha fraca', { password: 'abcdefgh' }, 'password'],
    ['senha com o nome da pessoa', { password: 'Maria@2026#x' }, 'password'],
  ])('deve recusar %s informando somente o campo', async (_caso, override, field) => {
    const { controller, executeRegister, reply, request } = createFixture();

    const error: unknown = await controller
      .register({ ...validRegistration, ...override }, request, reply)
      .catch((caught: unknown) => caught);

    expect(error).toMatchObject({
      response: { message: 'Dados de cadastro inválidos.', fields: [field] },
    });

    expect(JSON.stringify(error)).not.toContain('Diversos@@2026');

    expect(executeRegister).not.toHaveBeenCalled();
  });

  it('deve recusar corpo ausente', async () => {
    const { controller, reply, request } = createFixture();

    await expect(controller.register(null, request, reply)).rejects.toThrow(
      'Dados de cadastro inválidos.',
    );
  });
});
