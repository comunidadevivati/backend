import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RedisService } from '../../../shared/infrastructure/redis/redis.service.js';

export interface AuthSession {
  subject: string;
  email?: string;
  name?: string;
  csrfToken: string;
  accessToken: string;
  refreshToken?: string;
  idToken?: string;
  accessTokenExpiresAt: number;
  createdAt: number;
}

@Injectable()
export class SessionService {
  private readonly prefix = 'comvivati:bff:session:';

  private readonly ttlSeconds = 30 * 60;

  private readonly encryptionKey: Buffer;

  constructor(
    @Inject(RedisService)
    private readonly redisService: RedisService,
    @Inject(ConfigService)
    private readonly configService: ConfigService,
  ) {
    const secret = this.configService.getOrThrow<string>('SESSION_ENCRYPTION_KEY');

    this.encryptionKey = Buffer.from(secret, 'base64url');

    if (this.encryptionKey.length !== 32) {
      throw new Error('SESSION_ENCRYPTION_KEY deve conter 32 bytes.');
    }
  }

  async createSession(session: AuthSession): Promise<string> {
    const sessionId = randomBytes(32).toString('base64url');

    const encrypted = this.encrypt(JSON.stringify(session));

    await this.redisService
      .getClient()
      .set(this.key(sessionId), encrypted, { EX: this.ttlSeconds });

    return sessionId;
  }

  async getSession(sessionId: string): Promise<AuthSession | null> {
    if (!/^[A-Za-z0-9_-]{43}$/u.test(sessionId)) {
      return null;
    }

    const encrypted = await this.redisService.getClient().get(this.key(sessionId));

    if (!encrypted) {
      return null;
    }

    return JSON.parse(this.decrypt(encrypted)) as AuthSession;
  }

  async deleteSession(sessionId: string): Promise<void> {
    if (!/^[A-Za-z0-9_-]{43}$/u.test(sessionId)) {
      return;
    }

    await this.redisService.getClient().del(this.key(sessionId));
  }

  private key(sessionId: string): string {
    return `${this.prefix}${sessionId}`;
  }

  private encrypt(plaintext: string): string {
    const iv = randomBytes(12);

    const cipher = createCipheriv('aes-256-gcm', this.encryptionKey, iv);

    const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);

    return [
      iv.toString('base64url'),
      cipher.getAuthTag().toString('base64url'),
      encrypted.toString('base64url'),
    ].join('.');
  }

  private decrypt(payload: string): string {
    const parts = payload.split('.');

    if (parts.length !== 3) {
      throw new Error('Formato de sessão inválido.');
    }

    const [iv, tag, encrypted] = parts;

    if (!iv || !tag || !encrypted) {
      throw new Error('Dados da sessão incompletos.');
    }

    const decipher = createDecipheriv(
      'aes-256-gcm',
      this.encryptionKey,
      Buffer.from(iv, 'base64url'),
    );

    decipher.setAuthTag(Buffer.from(tag, 'base64url'));

    return Buffer.concat([
      decipher.update(Buffer.from(encrypted, 'base64url')),
      decipher.final(),
    ]).toString('utf8');
  }
}
