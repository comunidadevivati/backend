import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';

// Limites por endereço de origem, em janelas de 1 minuto: consultar o link e enviar respostas.
const LIMITS = { lookup: 30, answers: 10 } as const;

const WINDOW_MS = 60_000;

// Endereços acompanhados ao mesmo tempo (os mais antigos saem primeiro).
const MAX_TRACKED = 10_000;

type Bucket = keyof typeof LIMITS;

// Limite de requisições das rotas públicas de resposta (ADR 0013), em memória: vale por instância do
// BFF e recomeça a cada reinício. O endereço vem do primeiro valor de X-Forwarded-For (proxy da
// hospedagem); sem ele, do próprio socket. É uma proteção contra abuso simples, não contra ataques
// distribuídos (o token de 256 bits é que impede adivinhar links).
@Injectable()
export class PublicRateLimiter {
  private readonly windows = new Map<string, { startedAt: number; count: number }>();

  check(request: FastifyRequest, bucket: Bucket): void {
    const forwarded = request.headers['x-forwarded-for'];

    const address =
      (Array.isArray(forwarded) ? forwarded[0] : forwarded)?.split(',')[0]?.trim() || request.ip;

    const key = `${bucket}:${address}`;

    const now = Date.now();

    const current = this.windows.get(key);

    if (!current || now - current.startedAt >= WINDOW_MS) {
      this.windows.delete(key);

      this.windows.set(key, { startedAt: now, count: 1 });

      this.trim();

      return;
    }

    current.count += 1;

    if (current.count > LIMITS[bucket]) {
      throw new HttpException(
        'Muitas tentativas em pouco tempo. Aguarde um minuto e tente de novo.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  private trim(): void {
    while (this.windows.size > MAX_TRACKED) {
      const oldest = this.windows.keys().next().value;

      if (oldest === undefined) {
        return;
      }

      this.windows.delete(oldest);
    }
  }
}
