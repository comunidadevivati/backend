import { Controller, HttpCode, Inject, Param, Post, UseGuards } from '@nestjs/common';
import { ServiceTokenGuard } from '../../../shared/presentation/service-token.guard.js';
import {
  ChangeMembershipStatusUseCase,
  type MembershipView,
} from '../application/membership.use-cases.js';
import { parseId, unwrap } from './members-problem.js';
import type { MembershipStatusAction } from '../domain/membership.js';

// Vínculos são consultados e registrados a partir do membro (/members/:id/memberships); aqui ficam
// somente as mudanças de situação de um vínculo já existente.
@Controller('memberships')
@UseGuards(ServiceTokenGuard)
export class MembershipsController {
  constructor(
    @Inject(ChangeMembershipStatusUseCase)
    private readonly changeStatus: ChangeMembershipStatusUseCase,
  ) {}

  // PENDING → ACTIVE: define a data de início.
  @Post(':id/activate')
  @HttpCode(200)
  activate(@Param('id') id: string): Promise<MembershipView> {
    return this.change(id, 'activate');
  }

  // PENDING | ACTIVE → INACTIVE: define a data de encerramento e preserva o histórico.
  @Post(':id/deactivate')
  @HttpCode(200)
  deactivate(@Param('id') id: string): Promise<MembershipView> {
    return this.change(id, 'deactivate');
  }

  private async change(id: string, action: MembershipStatusAction): Promise<MembershipView> {
    return unwrap(await this.changeStatus.execute({ id: parseId(id), action }));
  }
}
