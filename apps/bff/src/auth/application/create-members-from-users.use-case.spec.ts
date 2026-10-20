import { describe, expect, it, vi } from 'vitest';
import { CreateMembersFromUsersUseCase } from './create-members-from-users.use-case.js';
import type {
  CreatePerson,
  LinkPersonResult,
  UserPersonLinkRepository,
} from '../infrastructure/users/user-person-link.repository.js';
import type { MemberRegistry } from './ports/member-registry.js';

const source = {
  accountId: 'u-1',
  name: 'Paula Ribeiro',
  email: 'paula@exemplo.com',
  phone: '67991112233',
};

const createFixture = () => {
  const accounts = {
    linkPerson: vi.fn(
      async (_id: string, createPerson: CreatePerson): Promise<LinkPersonResult> => {
        const personId = await createPerson(source);

        return personId ? { status: 'linked', personId } : { status: 'rejected' };
      },
    ),
  };

  const members = { register: vi.fn(() => Promise.resolve<string | null>('p-1')) };

  return {
    accounts,
    members,
    useCase: new CreateMembersFromUsersUseCase(
      accounts as unknown as UserPersonLinkRepository,
      members as unknown as MemberRegistry,
    ),
  };
};

describe('CreateMembersFromUsersUseCase', () => {
  it('deve criar a Pessoa e o membro com a conta, o nome, o e-mail e o telefone', async () => {
    const { members, useCase } = createFixture();

    await expect(useCase.execute(['u-1'])).resolves.toEqual([
      { userId: 'u-1', status: 'linked', personId: 'p-1' },
    ]);

    expect(members.register).toHaveBeenCalledWith({
      accountId: 'u-1',
      fullName: 'Paula Ribeiro',
      email: 'paula@exemplo.com',
      phone: '67991112233',
    });
  });

  it('deve processar cada conta uma vez, em ordem, sem interromper nas falhas', async () => {
    const { accounts, members, useCase } = createFixture();

    accounts.linkPerson
      .mockResolvedValueOnce({ status: 'already_linked', personId: 'p-0' })
      .mockResolvedValueOnce({ status: 'unverified' })
      .mockRejectedValueOnce(new Error('Core API indisponível.'));

    members.register.mockResolvedValueOnce(null);

    await expect(useCase.execute(['u-1', 'u-2', 'u-1', 'u-3', 'u-4'])).resolves.toEqual([
      { userId: 'u-1', status: 'already_linked', personId: 'p-0' },
      { userId: 'u-2', status: 'unverified' },
      { userId: 'u-3', status: 'unavailable' },
      { userId: 'u-4', status: 'rejected' },
    ]);

    expect(accounts.linkPerson.mock.calls.map(([id]) => id)).toEqual(['u-1', 'u-2', 'u-3', 'u-4']);
  });
});
