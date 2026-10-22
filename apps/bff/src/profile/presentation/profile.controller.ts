import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  Inject,
  Post,
  Put,
  Req,
  Res,
} from '@nestjs/common';
import { z } from 'zod';
import {
  AccountProfileRepository,
  type AccountSubscriptions,
} from '../../auth/infrastructure/users/account-profile.repository.js';
import { SessionCookieService } from '../../auth/presentation/session-cookie.service.js';
import { CoreApiForwarder } from '../../core-api/presentation/core-api-forwarder.service.js';
import type { FastifyReply, FastifyRequest } from 'fastify';

// Nome e telefone gravados na Pessoa, copiados para a conta (sessão e cabeçalho).
const savedContactSchema = z.object({ fullName: z.string(), phone: z.string().nullable() });

const subscriptionsRequestSchema = z.strictObject({ news: z.boolean() });

// Perfil da pessoa logada: o cadastro da Pessoa (Core API), a foto e as preferências de comunicação
// da conta. A Pessoa é sempre a vinculada à conta da sessão; quem ainda não é membro não tem Perfil.
@Controller('api/v1/profile')
export class ProfileController {
  constructor(
    @Inject(CoreApiForwarder) private readonly forwarder: CoreApiForwarder,
    @Inject(AccountProfileRepository) private readonly accounts: AccountProfileRepository,
    @Inject(SessionCookieService) private readonly sessionCookies: SessionCookieService,
  ) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  async get(@Req() request: FastifyRequest, @Res({ passthrough: true }) reply: FastifyReply) {
    const { body } = await this.forwardAsPerson(request, reply, {
      write: false,
      method: 'GET',
      path: '',
    });

    return body;
  }

  // Substituição completa do cadastro, com a versão lida (controle otimista). O e-mail principal não
  // muda aqui: é o e-mail de acesso, trocado em /auth/email-change.
  @Put()
  @Header('Cache-Control', 'no-store')
  async update(
    @Body() body: unknown,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    const { body: saved, userId } = await this.forwardAsPerson(request, reply, {
      write: true,
      method: 'PUT',
      path: '',
      body: body ?? {},
    });

    const contact = savedContactSchema.safeParse(saved);

    if (reply.statusCode === 200 && contact.success) {
      await this.accounts.syncContact(userId, {
        name: contact.data.fullName,
        phone: contact.data.phone,
      });
    }

    return saved;
  }

  // URL para o navegador enviar a foto direto ao bucket de mídia; PUT /avatar confirma o envio.
  @Post('avatar/uploads')
  @Header('Cache-Control', 'no-store')
  async avatarUpload(
    @Body() body: unknown,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    const { body: ticket } = await this.forwardAsPerson(request, reply, {
      write: true,
      method: 'POST',
      path: 'avatar/uploads',
      body: body ?? {},
    });

    return ticket;
  }

  @Put('avatar')
  @Header('Cache-Control', 'no-store')
  async avatar(
    @Body() body: unknown,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    const { body: saved } = await this.forwardAsPerson(request, reply, {
      write: true,
      method: 'PUT',
      path: 'avatar',
      body: body ?? {},
    });

    return saved;
  }

  @Delete('avatar')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  async deleteAvatar(
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    const { body: saved } = await this.forwardAsPerson(request, reply, {
      write: true,
      method: 'DELETE',
      path: 'avatar',
    });

    return saved;
  }

  // Preferências de comunicação: são da conta (BFF), não da Pessoa.
  @Get('subscriptions')
  @Header('Cache-Control', 'no-store')
  async subscriptions(@Req() request: FastifyRequest): Promise<AccountSubscriptions> {
    const { session } = await this.sessionCookies.requireSession(request);

    return this.accounts.getSubscriptions(session.userId);
  }

  @Put('subscriptions')
  @Header('Cache-Control', 'no-store')
  async updateSubscriptions(
    @Body() body: unknown,
    @Req() request: FastifyRequest,
  ): Promise<AccountSubscriptions> {
    const { session } = await this.sessionCookies.requireSession(request);

    this.sessionCookies.assertCsrfToken(request, session);

    const input = subscriptionsRequestSchema.safeParse(body);

    if (!input.success) {
      throw new BadRequestException('Informe as inscrições.');
    }

    await this.accounts.setSubscriptions(session.userId, input.data);

    return input.data;
  }

  private forwardAsPerson(
    request: FastifyRequest,
    reply: FastifyReply,
    options: Parameters<CoreApiForwarder['forwardAsPerson']>[2],
  ) {
    return this.forwarder.forwardAsPerson(request, reply, options, (userId) =>
      this.accounts.findPersonId(userId),
    );
  }
}
