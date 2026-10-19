import { describe, expect, it, vi } from 'vitest';
import { UserManagementUseCases } from './user-management.use-cases.js';
import type {
  UserAccount,
  UserAccountRepository,
} from '../infrastructure/users/user-account.repository.js';
import type { UserRepository } from '../infrastructure/users/user.repository.js';
import type { SendEmailVerificationUseCase } from './send-email-verification.use-case.js';

const account = (overrides: Partial<UserAccount> = {}): UserAccount => ({
  id: 'u-1',
  name: 'Paula Ribeiro',
  email: 'paula@exemplo.com',
  phone: '67991112233',
  status: 'ACTIVE',
  emailVerified: false,
  createdAt: '2026-10-19T12:00:00Z',
  suspendedAt: null,
  ...overrides,
});

const registration = {
  name: 'Paula Ribeiro',
  phone: '67991112233',
  email: 'paula@exemplo.com',
  password: 'Diversos@@2026',
};

const uniqueViolation = Object.assign(new Error('duplicada'), { code: '23505' });

const createFixture = () => {
  const accounts = {
    list: vi.fn(() => Promise.resolve([account(), account({ id: 'u-2' })])),
    findById: vi.fn(() => Promise.resolve<UserAccount | null>(account())),
    update: vi.fn(),
    setStatus: vi.fn(() => Promise.resolve<UserAccount | null>(account({ status: 'SUSPENDED' }))),
    deleteUnverified: vi.fn(() => Promise.resolve('deleted' as const)),
  };

  const userRepository = { create: vi.fn(() => Promise.resolve('u-1')) };

  const sendEmailVerification = { execute: vi.fn(() => Promise.resolve('sent')) };

  return {
    accounts,
    sendEmailVerification,
    userRepository,
    useCases: new UserManagementUseCases(
      accounts as unknown as UserAccountRepository,
      userRepository as unknown as UserRepository,
      sendEmailVerification as unknown as SendEmailVerificationUseCase,
    ),
  };
};

describe('UserManagementUseCases', () => {
  it('deve paginar por cursor buscando um item a mais', async () => {
    const { accounts, useCases } = createFixture();

    await expect(
      useCases.list({
        status: null,
        emailVerified: false,
        search: 'paula',
        cursor: null,
        limit: 1,
      }),
    ).resolves.toEqual({ items: [account()], nextCursor: 'u-1' });

    expect(accounts.list).toHaveBeenCalledWith({
      status: null,
      emailVerified: false,
      search: 'paula',
      after: null,
      limit: 2,
    });

    accounts.list.mockResolvedValueOnce([account()]);

    await expect(
      useCases.list({
        status: 'ACTIVE',
        emailVerified: null,
        search: null,
        cursor: 'u-0',
        limit: 5,
      }),
    ).resolves.toEqual({ items: [account()], nextCursor: null });
  });

  it('deve cadastrar com senha protegida e enviar o link de verificação', async () => {
    const { sendEmailVerification, useCases, userRepository } = createFixture();

    await expect(useCases.create(registration)).resolves.toEqual({
      status: 'created',
      account: account(),
    });

    const [[created]] = userRepository.create.mock.calls as unknown as [[{ passwordHash: string }]];

    expect(created.passwordHash).not.toBe(registration.password);

    expect(sendEmailVerification.execute).toHaveBeenCalledWith({
      userId: 'u-1',
      email: 'paula@exemplo.com',
      name: 'Paula Ribeiro',
    });
  });

  it('deve recusar e-mail já cadastrado e manter o cadastro se o envio falhar', async () => {
    const { accounts, sendEmailVerification, useCases, userRepository } = createFixture();

    userRepository.create.mockRejectedValueOnce(uniqueViolation);

    await expect(useCases.create(registration)).resolves.toEqual({ status: 'email_taken' });

    userRepository.create.mockRejectedValueOnce(new Error('banco fora'));

    await expect(useCases.create(registration)).rejects.toThrow('banco fora');

    sendEmailVerification.execute.mockRejectedValueOnce(new Error('Resend fora'));

    await expect(useCases.create(registration)).resolves.toMatchObject({ status: 'created' });

    accounts.findById.mockResolvedValueOnce(null);

    await expect(useCases.create(registration)).rejects.toThrow('Conta recém-criada');
  });

  it('deve enviar novo link somente quando o e-mail muda', async () => {
    const { accounts, sendEmailVerification, useCases } = createFixture();

    accounts.update.mockResolvedValueOnce({
      status: 'updated',
      account: account({ name: 'Paula Souza' }),
      emailChanged: false,
    });

    await useCases.update('u-1', { name: 'Paula Souza' });

    expect(sendEmailVerification.execute).not.toHaveBeenCalled();

    accounts.update.mockResolvedValueOnce({
      status: 'updated',
      account: account({ email: 'nova@exemplo.com' }),
      emailChanged: true,
    });

    await useCases.update('u-1', { email: 'nova@exemplo.com' });

    expect(sendEmailVerification.execute).toHaveBeenCalledWith({
      userId: 'u-1',
      email: 'nova@exemplo.com',
      name: 'Paula Ribeiro',
    });

    accounts.update.mockResolvedValueOnce({ status: 'not_found' });

    await expect(useCases.update('u-9', {})).resolves.toEqual({ status: 'not_found' });
  });

  it('deve impedir que a conta suspenda ou exclua a si mesma', async () => {
    const { accounts, useCases } = createFixture();

    await expect(useCases.changeStatus('u-1', 'u-1', 'SUSPENDED')).resolves.toEqual({
      status: 'self',
    });

    await expect(useCases.delete('u-1', 'u-1')).resolves.toBe('self');

    expect(accounts.setStatus).not.toHaveBeenCalled();

    expect(accounts.deleteUnverified).not.toHaveBeenCalled();
  });

  it('deve suspender, informar conta inexistente e excluir conta de outra pessoa', async () => {
    const { accounts, useCases } = createFixture();

    await expect(useCases.changeStatus('u-0', 'u-1', 'SUSPENDED')).resolves.toMatchObject({
      status: 'changed',
      account: { status: 'SUSPENDED' },
    });

    accounts.setStatus.mockResolvedValueOnce(null);

    await expect(useCases.changeStatus('u-0', 'u-9', 'ACTIVE')).resolves.toEqual({
      status: 'not_found',
    });

    await expect(useCases.delete('u-0', 'u-1')).resolves.toBe('deleted');

    await expect(useCases.get('u-1')).resolves.toEqual(account());
  });
});
