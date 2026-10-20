import { createHash, timingSafeEqual } from 'node:crypto';
import { Inject, Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ProblemException } from './problem-details.js';
import type { FastifyRequest } from 'fastify';

const digest = (value: string): Buffer => createHash('sha256').update(value).digest();

// Autenticação provisória de serviço (ADR 0006): somente o BFF conhece o CORE_API_TOKEN e o envia
// em `Authorization: Bearer`. Não identifica pessoas; a propagação da identidade do usuário
// continua pendente de decisão arquitetural.
@Injectable()
export class ServiceTokenGuard implements CanActivate {
  private readonly expected: Buffer;

  constructor(@Inject(ConfigService) configService: ConfigService) {
    this.expected = digest(configService.getOrThrow<string>('CORE_API_TOKEN'));
  }

  canActivate(context: ExecutionContext): boolean {
    const header = context.switchToHttp().getRequest<FastifyRequest>().headers.authorization;

    const token = /^Bearer (\S+)$/u.exec(header ?? '')?.[1];

    // Compara os digests (mesmo tamanho) em tempo constante.
    if (!token || !timingSafeEqual(digest(token), this.expected)) {
      throw new ProblemException(401, 'Credencial de serviço ausente ou inválida.');
    }

    return true;
  }
}
