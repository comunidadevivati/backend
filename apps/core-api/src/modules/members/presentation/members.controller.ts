import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Param,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import { parseOrThrow } from '../../../shared/presentation/request-parsing.js';
import { ServiceTokenGuard } from '../../../shared/presentation/service-token.guard.js';
import {
  ChangeMemberStatusUseCase,
  EnrollMemberUseCase,
  GetMemberUseCase,
  ListMembersUseCase,
  type MemberPage,
} from '../application/member.use-cases.js';
import {
  ListMembershipsUseCase,
  RegisterMembershipUseCase,
  type MembershipView,
} from '../application/membership.use-cases.js';
import { parseId, throwInvalidFields, unwrap } from './members-problem.js';
import {
  enrollMemberSchema,
  listMembersSchema,
  registerMembershipSchema,
} from './members-request.schemas.js';
import type { MemberView } from '../application/ports.js';
import type { MemberStatusAction } from '../domain/member.js';
import type { FastifyReply } from 'fastify';

@Controller('members')
@UseGuards(ServiceTokenGuard)
export class MembersController {
  constructor(
    @Inject(ListMembersUseCase)
    private readonly listMembers: ListMembersUseCase,
    @Inject(GetMemberUseCase)
    private readonly getMember: GetMemberUseCase,
    @Inject(EnrollMemberUseCase)
    private readonly enrollMember: EnrollMemberUseCase,
    @Inject(ChangeMemberStatusUseCase)
    private readonly changeStatus: ChangeMemberStatusUseCase,
    @Inject(ListMembershipsUseCase)
    private readonly listMemberships: ListMembershipsUseCase,
    @Inject(RegisterMembershipUseCase)
    private readonly registerMembership: RegisterMembershipUseCase,
  ) {}

  // Filtros: status, congregationId (vínculo ativo ou pendente), search (trecho do nome), cursor
  // (nextCursor da página anterior) e limit.
  @Get()
  async list(@Query() query: unknown): Promise<MemberPage> {
    return this.listMembers.execute(parseOrThrow(listMembersSchema, query, throwInvalidFields));
  }

  @Get(':id')
  async get(@Param('id') id: string): Promise<MemberView> {
    return unwrap(await this.getMember.execute(parseId(id)));
  }

  // Conta verificada → Pessoa → membro (nasce ACTIVE). Chamado somente pelo BFF, que garante a
  // verificação da conta. 201 ao criar; 200 com o mesmo membro quando a conta já foi convertida.
  @Post()
  async enroll(
    @Body() body: unknown,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<MemberView> {
    const { created, member } = unwrap(
      await this.enrollMember.execute(parseOrThrow(enrollMemberSchema, body, throwInvalidFields)),
    );

    void reply.status(created ? 201 : 200);

    return member;
  }

  @Post(':id/activate')
  @HttpCode(200)
  activate(@Param('id') id: string): Promise<MemberView> {
    return this.change(id, 'activate');
  }

  @Post(':id/deactivate')
  @HttpCode(200)
  deactivate(@Param('id') id: string): Promise<MemberView> {
    return this.change(id, 'deactivate');
  }

  @Post(':id/archive')
  @HttpCode(200)
  archive(@Param('id') id: string): Promise<MemberView> {
    return this.change(id, 'archive');
  }

  @Post(':id/restore')
  @HttpCode(200)
  restore(@Param('id') id: string): Promise<MemberView> {
    return this.change(id, 'restore');
  }

  // Histórico completo de vínculos do membro, inclusive os encerrados.
  @Get(':id/memberships')
  async memberships(@Param('id') id: string): Promise<MembershipView[]> {
    return unwrap(await this.listMemberships.execute(parseId(id)));
  }

  // O vínculo nasce PENDING; use /memberships/:id/activate para confirmá-lo.
  @Post(':id/memberships')
  async addMembership(@Param('id') id: string, @Body() body: unknown): Promise<MembershipView> {
    const memberId = parseId(id);

    const input = parseOrThrow(registerMembershipSchema, body, throwInvalidFields);

    return unwrap(await this.registerMembership.execute({ memberId, ...input }));
  }

  private async change(id: string, action: MemberStatusAction): Promise<MemberView> {
    return unwrap(await this.changeStatus.execute({ id: parseId(id), action }));
  }
}
