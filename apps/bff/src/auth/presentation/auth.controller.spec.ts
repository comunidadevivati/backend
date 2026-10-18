import { describe, expect, it, vi } from 'vitest';
import { AuthController } from './auth.controller.js';
import { SessionCookieService } from './session-cookie.service.js';
import type { LoginResult, LoginUseCase } from '../application/login.use-case.js';
import type { RegisterUserUseCase } from '../application/register-user.use-case.js';
import type { AuthSession, SessionService } from '../infrastructure/session/session.service.js';
import type { ConfigService } from '@nestjs/config';
import type { FastifyReply, FastifyRequest } from 'fastify';

const authenticatedSession: AuthSession = {
  userId: '0199f0a0-0000-7000-8000-000000000001',
  email: 'usuario@exemplo.com',
  name: 'Usuário Exemplo',
  emailVerified: false,
  csrfToken: 'csrf-token-teste',
};

const loginResult: LoginResult = {
  sessionToken: 'novo-token-de-sessao',
  csrfToken: 'novo-csrf-token',
  user: {
    id: '0199f0a0-0000-7000-8000-000000000001',
    email: 'usuario@exemplo.com',
    name: 'Usuário Exemplo',
    emailVerified: true,
  },
};

interface FixtureOptions {
  baseUrl?: string;
  cookie?: string;
  validSignature?: boolean;
  session?: AuthSession | null;
  csrfToken?: string;
  loginResult?: LoginResult | null;
}

const createFixture = ({
  baseUrl = 'http://localhost:3000',
  cookie,
  validSignature = true,
  session = null,
  csrfToken,
  loginResult: result = null,
}: FixtureOptions = {}) => {
  const execute = vi.fn(() => Promise.resolve(result));

  const getSession = vi.fn(() => Promise.resolve(session));

  const deleteSession = vi.fn(() => Promise.resolve());

  const loginUseCase = { execute } as unknown as LoginUseCase;

  const sessionService = { getSession, deleteSession } as unknown as SessionService;

  const configService = {
    getOrThrow: vi.fn(() => baseUrl),
  } as unknown as ConfigService;

  const cookieName = baseUrl.startsWith('https') ? '__Host-comvivati-session' : 'comvivati_session';

  const request = {
    cookies: cookie ? { [cookieName]: cookie } : {},
    headers: csrfToken ? { 'x-csrf-token': csrfToken } : {},
    unsignCookie: vi.fn(() => ({
      valid: validSignature,
      value: validSignature ? 'token-da-sessao' : null,
    })),
  } as unknown as FastifyRequest;

  const reply = {
    clearCookie: vi.fn(),
    setCookie: vi.fn(),
  } as unknown as FastifyReply;

  const controller = new AuthController(
    loginUseCase,
    {} as RegisterUserUseCase,
    sessionService,
    new SessionCookieService(sessionService, configService),
  );

  return { controller, deleteSession, execute, reply, request };
};

describe('AuthController — login', () => {
  it('deve autenticar, criar o cookie de sessão e retornar a sessão pública', async () => {
    const { controller, execute, reply, request } = createFixture({ loginResult });

    const response = await controller.login(
      { email: 'usuario@exemplo.com', password: 'senha-correta' },
      request,
      reply,
    );

    expect(execute).toHaveBeenCalledWith({
      email: 'usuario@exemplo.com',
      password: 'senha-correta',
    });

    expect(reply.setCookie).toHaveBeenCalledWith('comvivati_session', 'novo-token-de-sessao', {
      httpOnly: true,
      signed: true,
      secure: false,
      sameSite: 'lax',
      path: '/',
      maxAge: 43_200,
    });

    expect(response).toEqual({
      authenticated: true,
      message: 'Usuário autenticado com sucesso.',
      csrfToken: 'novo-csrf-token',
      user: {
        emailVerified: true,
        subject: loginResult.user.id,
        email: 'usuario@exemplo.com',
        name: 'Usuário Exemplo',
      },
    });
  });
});

describe('AuthController — cookie de sessão no login', () => {
  it('deve usar cookie __Host- seguro quando o BFF estiver em HTTPS', async () => {
    const { controller, reply, request } = createFixture({
      baseUrl: 'https://app.exemplo.com',
      loginResult,
    });

    await controller.login({ email: 'usuario@exemplo.com', password: 'x' }, request, reply);

    expect(reply.setCookie).toHaveBeenCalledWith(
      '__Host-comvivati-session',
      'novo-token-de-sessao',
      expect.objectContaining({ secure: true }),
    );
  });
});

describe('AuthController — rotação de sessão no login', () => {
  it('deve revogar a sessão anterior do navegador ao autenticar novamente', async () => {
    const { controller, deleteSession, reply, request } = createFixture({
      cookie: 'cookie-assinado',
      loginResult,
    });

    await controller.login({ email: 'usuario@exemplo.com', password: 'x' }, request, reply);

    expect(deleteSession).toHaveBeenCalledWith('token-da-sessao');
  });

  it('deve ignorar cookie anterior com assinatura inválida', async () => {
    const { controller, deleteSession, reply, request } = createFixture({
      cookie: 'cookie-adulterado',
      validSignature: false,
      loginResult,
    });

    await controller.login({ email: 'usuario@exemplo.com', password: 'x' }, request, reply);

    expect(deleteSession).not.toHaveBeenCalled();
  });
});

describe('AuthController — login recusado', () => {
  it.each([
    [undefined],
    [{}],
    [{ email: 'nao-e-email', password: 'senha' }],
    [{ email: 'usuario@exemplo.com', password: '' }],
  ])('deve rejeitar corpo inválido %#', async (body) => {
    const { controller, execute, reply, request } = createFixture();

    await expect(controller.login(body, request, reply)).rejects.toThrow(
      'Informe um e-mail válido e a senha.',
    );

    expect(execute).not.toHaveBeenCalled();
  });

  it('deve rejeitar credenciais inválidas sem criar cookie', async () => {
    const { controller, reply, request } = createFixture();

    await expect(
      controller.login({ email: 'usuario@exemplo.com', password: 'errada' }, request, reply),
    ).rejects.toThrow('E-mail ou senha inválidos.');

    expect(reply.setCookie).not.toHaveBeenCalled();
  });
});

describe('AuthController — sessão atual', () => {
  it('deve retornar a sessão pública do usuário autenticado', async () => {
    const { controller, request } = createFixture({
      cookie: 'cookie-assinado',
      session: authenticatedSession,
    });

    await expect(controller.me(request)).resolves.toEqual({
      authenticated: true,
      csrfToken: 'csrf-token-teste',
      user: {
        emailVerified: false,
        subject: authenticatedSession.userId,
        email: 'usuario@exemplo.com',
        name: 'Usuário Exemplo',
      },
    });
  });

  it('deve rejeitar requisições sem cookie', async () => {
    const { controller, request } = createFixture();

    await expect(controller.me(request)).rejects.toThrow('Sessão não encontrada.');
  });

  it('deve rejeitar cookies com assinatura inválida', async () => {
    const { controller, request } = createFixture({
      cookie: 'cookie-invalido',
      validSignature: false,
    });

    await expect(controller.me(request)).rejects.toThrow('Sessão inválida.');
  });

  it('deve rejeitar sessões inexistentes ou expiradas', async () => {
    const { controller, request } = createFixture({ cookie: 'cookie-assinado' });

    await expect(controller.me(request)).rejects.toThrow('Sessão expirada ou inválida.');
  });
});

describe('AuthController — logout', () => {
  it('deve revogar a sessão e remover o cookie', async () => {
    const { controller, deleteSession, reply, request } = createFixture({
      cookie: 'cookie-assinado',
      session: authenticatedSession,
      csrfToken: 'csrf-token-teste',
    });

    await expect(controller.logout(request, reply)).resolves.toEqual({
      authenticated: false,
      message: 'O logout foi efetuado com sucesso.',
    });

    expect(deleteSession).toHaveBeenCalledWith('token-da-sessao');

    expect(reply.clearCookie).toHaveBeenCalledWith('comvivati_session', { path: '/' });
  });

  it('deve rejeitar logout sem token CSRF', async () => {
    const { controller, deleteSession, reply, request } = createFixture({
      cookie: 'cookie-assinado',
      session: authenticatedSession,
    });

    await expect(controller.logout(request, reply)).rejects.toThrow('Token CSRF inválido.');

    expect(deleteSession).not.toHaveBeenCalled();
  });

  it('deve rejeitar token CSRF com tamanho diferente', async () => {
    const { controller, reply, request } = createFixture({
      cookie: 'cookie-assinado',
      session: authenticatedSession,
      csrfToken: 'invalido',
    });

    await expect(controller.logout(request, reply)).rejects.toThrow('Token CSRF inválido.');
  });

  it('deve rejeitar token CSRF incorreto com o mesmo tamanho', async () => {
    const { controller, reply, request } = createFixture({
      cookie: 'cookie-assinado',
      session: authenticatedSession,
      csrfToken: 'csrf-token-falso',
    });

    await expect(controller.logout(request, reply)).rejects.toThrow('Token CSRF inválido.');
  });
});
