import { Inject, Injectable, Logger } from '@nestjs/common';
import { getPersonalInfoTerms, isWeakPassword } from '../domain/policies/password-policy.js';
import { EmailChangeTokenRepository } from '../infrastructure/email-change/email-change-token.repository.js';
import { hashPassword, verifyPassword } from '../infrastructure/password/password-hasher.js';
import { SessionService } from '../infrastructure/session/session.service.js';
import { AccountProfileRepository } from '../infrastructure/users/account-profile.repository.js';
import { UserRepository } from '../infrastructure/users/user.repository.js';
import { EmailChangeEmailSender } from './ports/email-change-email-sender.js';
import { PersonEmailSync } from './ports/person-email-sync.js';

export interface ChangePasswordCommand {
  userId: string;
  // Token da sessão atual, que continua aberta; as demais são encerradas.
  sessionToken: string;
  currentPassword: string;
  newPassword: string;
}

export type ChangePasswordResult = 'changed' | 'invalid_password' | 'weak_password';

export interface RequestEmailChangeCommand {
  userId: string;
  currentPassword: string;
  newEmail: string;
}

export type RequestEmailChangeResult =
  | 'sent'
  | 'invalid_password'
  | 'same_email'
  | 'email_taken'
  | 'cooldown';

export type ConfirmEmailChangeResult = 'changed' | 'invalid_token' | 'email_taken';

// Segurança da conta no Perfil: trocar a senha e o e-mail de acesso. As duas exigem a senha atual,
// para uma sessão esquecida aberta não bastar para tomar a conta.
@Injectable()
export class AccountSecurityUseCases {
  private readonly logger = new Logger(AccountSecurityUseCases.name);

  constructor(
    @Inject(AccountProfileRepository)
    private readonly accounts: AccountProfileRepository,
    @Inject(UserRepository)
    private readonly users: UserRepository,
    @Inject(SessionService)
    private readonly sessions: SessionService,
    @Inject(EmailChangeTokenRepository)
    private readonly emailChanges: EmailChangeTokenRepository,
    @Inject(EmailChangeEmailSender)
    private readonly emailSender: EmailChangeEmailSender,
    @Inject(PersonEmailSync)
    private readonly personEmail: PersonEmailSync,
  ) {}

  async changePassword({
    currentPassword,
    newPassword,
    sessionToken,
    userId,
  }: ChangePasswordCommand): Promise<ChangePasswordResult> {
    const account = await this.accounts.findCredentials(userId);

    if (!account || !(await verifyPassword(currentPassword, account.passwordHash))) {
      return 'invalid_password';
    }

    if (
      newPassword === currentPassword ||
      isWeakPassword(newPassword, getPersonalInfoTerms(account.name, account.email))
    ) {
      return 'weak_password';
    }

    await this.accounts.changePassword(userId, await hashPassword(newPassword));

    await this.sessions.deleteOtherSessions(userId, sessionToken);

    return 'changed';
  }

  // Envia o link ao novo e-mail; a troca só acontece quando ele for aberto.
  async requestEmailChange({
    currentPassword,
    newEmail,
    userId,
  }: RequestEmailChangeCommand): Promise<RequestEmailChangeResult> {
    const account = await this.accounts.findCredentials(userId);

    if (!account || !(await verifyPassword(currentPassword, account.passwordHash))) {
      return 'invalid_password';
    }

    if (newEmail === account.email) {
      return 'same_email';
    }

    if (await this.users.existsByEmail(newEmail)) {
      return 'email_taken';
    }

    const issued = await this.emailChanges.issue(userId, newEmail);

    if (issued.status !== 'issued') {
      return issued.status;
    }

    await this.emailSender.sendConfirmation({
      email: newEmail,
      name: account.name,
      token: issued.token,
      ttlHours: issued.ttlHours,
      idempotencyKey: `email-change/${issued.id}`,
    });

    return 'sent';
  }

  async confirmEmailChange(token: string): Promise<ConfirmEmailChangeResult> {
    const result = await this.emailChanges.confirm(token, (personId, email) =>
      this.personEmail.sync(personId, email),
    );

    if (result.status !== 'changed') {
      return result.status;
    }

    // O aviso ao e-mail anterior não desfaz a troca se falhar.
    try {
      await this.emailSender.sendChangedNotice({
        email: result.previousEmail,
        name: result.name,
        newEmail: result.newEmail,
        idempotencyKey: `email-changed/${result.id}`,
      });
    } catch {
      this.logger.warn('Falha ao avisar o e-mail anterior sobre a troca do e-mail de acesso.');
    }

    return 'changed';
  }
}
