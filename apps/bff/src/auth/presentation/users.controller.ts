import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Header,
  HttpCode,
  Inject,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import {
  UserManagementUseCases,
  type ChangeUserStatusResult,
  type UserPage,
} from '../application/user-management.use-cases.js';
import { SessionCookieService } from './session-cookie.service.js';
import {
  createUserRequestSchema,
  listUsersRequestSchema,
  updateUserRequestSchema,
  userIdSchema,
} from './users-request.schemas.js';
import type { UserAccount } from '../infrastructure/users/user-account.repository.js';
import type { FastifyRequest } from 'fastify';
import type { z } from 'zod';

const SELF_MESSAGE = 'Não é possível suspender ou excluir a própria conta.';

const NOT_FOUND_MESSAGE = 'Usuário não encontrado.';

// Conflito com código estável para o frontend, além da mensagem legível.
const conflict = (code: 'email_taken' | 'self_action' | 'verified_account', message: string) =>
  new ConflictException({ statusCode: 409, error: 'Conflict', code, message });

const emailTaken = () => conflict('email_taken', 'Já existe uma conta com este e-mail.');

// Somente os nomes dos campos recusados, nunca os valores enviados.
const parse = <T>(schema: z.ZodType<T>, input: unknown): T => {
  const result = schema.safeParse(input ?? {});

  if (!result.success) {
    throw new BadRequestException({
      statusCode: 400,
      error: 'Bad Request',
      message: 'Dados inválidos.',
      fields: [...new Set(result.error.issues.map(({ path }) => path.join('.') || 'body'))],
    });
  }

  return result.data;
};

// Um ID fora do formato UUID não pode existir: responde como inexistente.
const parseId = (id: string): string => {
  if (!userIdSchema.safeParse(id).success) {
    throw new NotFoundException(NOT_FOUND_MESSAGE);
  }

  return id;
};

const changedAccount = (result: ChangeUserStatusResult): UserAccount => {
  if (result.status === 'self') {
    throw conflict('self_action', SELF_MESSAGE);
  }

  if (result.status === 'not_found') {
    throw new NotFoundException(NOT_FOUND_MESSAGE);
  }

  return result.account;
};

// Gestão de contas (menu Usuários). Regra provisória do MVP, como nas rotas de negócio: sessão
// válida com e-mail verificado e X-CSRF-Token nas alterações; papéis ainda não existem.
@Controller('api/v1/users')
export class UsersController {
  constructor(
    @Inject(UserManagementUseCases)
    private readonly users: UserManagementUseCases,
    @Inject(SessionCookieService)
    private readonly sessionCookies: SessionCookieService,
  ) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  async list(@Query() query: unknown, @Req() request: FastifyRequest): Promise<UserPage> {
    await this.requireOperator(request, false);

    return this.users.list(parse(listUsersRequestSchema, query));
  }

  @Get(':id')
  @Header('Cache-Control', 'no-store')
  async get(@Param('id') id: string, @Req() request: FastifyRequest): Promise<UserAccount> {
    await this.requireOperator(request, false);

    const account = await this.users.get(parseId(id));

    if (!account) {
      throw new NotFoundException(NOT_FOUND_MESSAGE);
    }

    return account;
  }

  // Mesmo cadastro da tela de login; a conta nasce com o e-mail não verificado e recebe o link.
  @Post()
  @HttpCode(201)
  @Header('Cache-Control', 'no-store')
  async create(@Body() body: unknown, @Req() request: FastifyRequest): Promise<UserAccount> {
    await this.requireOperator(request, true);

    const result = await this.users.create(parse(createUserRequestSchema, body));

    if (result.status === 'email_taken') {
      throw emailTaken();
    }

    return result.account;
  }

  @Patch(':id')
  @Header('Cache-Control', 'no-store')
  async update(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() request: FastifyRequest,
  ): Promise<UserAccount> {
    await this.requireOperator(request, true);

    const result = await this.users.update(parseId(id), parse(updateUserRequestSchema, body));

    if (result.status === 'not_found') {
      throw new NotFoundException(NOT_FOUND_MESSAGE);
    }

    if (result.status === 'email_taken') {
      throw emailTaken();
    }

    return result.account;
  }

  // Bloqueia o login e encerra as sessões; reversível por /reactivate.
  @Post(':id/suspend')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  async suspend(@Param('id') id: string, @Req() request: FastifyRequest): Promise<UserAccount> {
    const actorId = await this.requireOperator(request, true);

    return changedAccount(await this.users.changeStatus(actorId, parseId(id), 'SUSPENDED'));
  }

  @Post(':id/reactivate')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  async reactivate(@Param('id') id: string, @Req() request: FastifyRequest): Promise<UserAccount> {
    const actorId = await this.requireOperator(request, true);

    return changedAccount(await this.users.changeStatus(actorId, parseId(id), 'ACTIVE'));
  }

  // Exclusão definitiva, somente de contas que nunca verificaram o e-mail.
  @Delete(':id')
  @HttpCode(204)
  @Header('Cache-Control', 'no-store')
  async delete(@Param('id') id: string, @Req() request: FastifyRequest): Promise<void> {
    const actorId = await this.requireOperator(request, true);

    const result = await this.users.delete(actorId, parseId(id));

    if (result === 'self') {
      throw conflict('self_action', SELF_MESSAGE);
    }

    if (result === 'not_found') {
      throw new NotFoundException(NOT_FOUND_MESSAGE);
    }

    if (result === 'verified') {
      throw conflict(
        'verified_account',
        'Somente contas com e-mail não verificado podem ser excluídas. Suspenda a conta.',
      );
    }
  }

  // Exige sessão com e-mail verificado (e CSRF nas alterações). Retorna o ID de quem opera.
  private async requireOperator(request: FastifyRequest, write: boolean): Promise<string> {
    const { session } = await this.sessionCookies.requireSession(request);

    if (!session.emailVerified) {
      throw new ForbiddenException('Confirme seu e-mail para acessar este recurso.');
    }

    if (write) {
      this.sessionCookies.assertCsrfToken(request, session);
    }

    return session.userId;
  }
}
