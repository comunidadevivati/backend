import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  UserPersonLinkRepository,
  type LinkPersonResult,
} from '../infrastructure/users/user-person-link.repository.js';
import { MemberRegistry } from './ports/member-registry.js';

// Resultado por conta: linked (Pessoa e membro criados agora), already_linked (já era Pessoa e
// membro), not_found, unverified (e-mail não verificado), rejected (recusado pelo Members) e
// unavailable (falha técnica).
export type MemberFromUserOutcome = { userId: string } & (
  | LinkPersonResult
  | { status: 'unavailable' }
);

// Para ser membro é preciso ser Pessoa, e para ser Pessoa é preciso ser usuário verificado. A
// conversão cria a Pessoa (cadastro completo, com os dados da conta) e o membro que a referencia.
@Injectable()
export class CreateMembersFromUsersUseCase {
  private readonly logger = new Logger(CreateMembersFromUsersUseCase.name);

  constructor(
    @Inject(UserPersonLinkRepository)
    private readonly links: UserPersonLinkRepository,
    @Inject(MemberRegistry)
    private readonly members: MemberRegistry,
  ) {}

  // Uma conta por vez, para não abrir várias transações e chamadas à Core API em paralelo. A falha
  // de uma conta não impede as demais: cada uma tem o próprio resultado.
  async execute(userIds: readonly string[]): Promise<MemberFromUserOutcome[]> {
    const outcomes: MemberFromUserOutcome[] = [];

    for (const userId of new Set(userIds)) {
      // oxlint-disable-next-line no-await-in-loop -- processamento sequencial intencional
      outcomes.push(await this.convert(userId));
    }

    return outcomes;
  }

  private async convert(userId: string): Promise<MemberFromUserOutcome> {
    try {
      const result = await this.links.linkPerson(userId, ({ accountId, email, name, phone }) =>
        this.members.register({ accountId, fullName: name, email, phone }),
      );

      return { userId, ...result };
    } catch {
      this.logger.error('Falha ao converter uma conta em membro.');

      return { userId, status: 'unavailable' };
    }
  }
}
