import { Controller, ForbiddenException, Get, Header, Inject, Req } from '@nestjs/common';
import {
  UserAccountRepository,
  type EmailRecipient,
} from '../infrastructure/users/user-account.repository.js';
import { SessionCookieService } from './session-cookie.service.js';
import type { FastifyRequest } from 'fastify';

// Teto de segurança da lista (sem paginação: a tela de grupos troca contas entre duas listas).
const MAX_RECIPIENTS = 5000;

// Contas que podem entrar nos grupos de e-mails (ADR 0013): ativas e com e-mail verificado, sejam
// membros ou não. Regra provisória do MVP: sessão com e-mail verificado; papéis ainda não existem.
@Controller('api/v1/email-recipients')
export class EmailRecipientsController {
  constructor(
    @Inject(UserAccountRepository)
    private readonly accounts: UserAccountRepository,
    @Inject(SessionCookieService)
    private readonly sessionCookies: SessionCookieService,
  ) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  async list(@Req() request: FastifyRequest): Promise<{ items: EmailRecipient[] }> {
    const { session } = await this.sessionCookies.requireSession(request);

    if (!session.emailVerified) {
      throw new ForbiddenException('Confirme seu e-mail para acessar este recurso.');
    }

    return { items: await this.accounts.listEmailRecipients(MAX_RECIPIENTS) };
  }
}
