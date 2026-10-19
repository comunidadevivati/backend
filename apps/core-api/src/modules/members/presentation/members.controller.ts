import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { parseOrThrow } from '../../../shared/presentation/request-parsing.js';
import { ServiceTokenGuard } from '../../../shared/presentation/service-token.guard.js';
import {
  ChangeMemberStatusUseCase,
  GetMemberUseCase,
  ListMembersUseCase,
  RegisterMemberUseCase,
  UpdateMemberUseCase,
  type MemberPage,
} from '../application/member.use-cases.js';
import {
  ListMembershipsUseCase,
  RegisterMembershipUseCase,
  type MembershipView,
} from '../application/membership.use-cases.js';
import { parseId, throwInvalidFields, unwrap } from './members-problem.js';
import {
  listMembersSchema,
  registerMemberSchema,
  registerMembershipSchema,
  updateMemberSchema,
} from './members-request.schemas.js';
import type { MemberSnapshot, MemberStatusAction } from '../domain/member.js';

@Controller('members')
@UseGuards(ServiceTokenGuard)
export class MembersController {
  constructor(
    @Inject(ListMembersUseCase)
    private readonly listMembers: ListMembersUseCase,
    @Inject(GetMemberUseCase)
    private readonly getMember: GetMemberUseCase,
    @Inject(RegisterMemberUseCase)
    private readonly registerMember: RegisterMemberUseCase,
    @Inject(UpdateMemberUseCase)
    private readonly updateMember: UpdateMemberUseCase,
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
  async get(@Param('id') id: string): Promise<MemberSnapshot> {
    return unwrap(await this.getMember.execute(parseId(id)));
  }

  // O membro nasce ACTIVE.
  @Post()
  async register(@Body() body: unknown): Promise<MemberSnapshot> {
    return unwrap(
      await this.registerMember.execute(
        parseOrThrow(registerMemberSchema, body, throwInvalidFields),
      ),
    );
  }

  // Alteração parcial com controle otimista: `version` deve ser a versão lida.
  @Patch(':id')
  async update(@Param('id') id: string, @Body() body: unknown): Promise<MemberSnapshot> {
    const { version, ...patch } = parseOrThrow(updateMemberSchema, body, throwInvalidFields);

    return unwrap(
      await this.updateMember.execute({ id: parseId(id), expectedVersion: version, patch }),
    );
  }

  @Post(':id/activate')
  @HttpCode(200)
  activate(@Param('id') id: string): Promise<MemberSnapshot> {
    return this.change(id, 'activate');
  }

  @Post(':id/deactivate')
  @HttpCode(200)
  deactivate(@Param('id') id: string): Promise<MemberSnapshot> {
    return this.change(id, 'deactivate');
  }

  @Post(':id/archive')
  @HttpCode(200)
  archive(@Param('id') id: string): Promise<MemberSnapshot> {
    return this.change(id, 'archive');
  }

  @Post(':id/restore')
  @HttpCode(200)
  restore(@Param('id') id: string): Promise<MemberSnapshot> {
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

  private async change(id: string, action: MemberStatusAction): Promise<MemberSnapshot> {
    return unwrap(await this.changeStatus.execute({ id: parseId(id), action }));
  }
}
