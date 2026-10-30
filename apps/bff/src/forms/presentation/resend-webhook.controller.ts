import { createHmac, timingSafeEqual } from 'node:crypto';
import {
  Controller,
  HttpCode,
  Inject,
  Logger,
  NotFoundException,
  Post,
  Req,
  UnauthorizedException,
  type RawBodyRequest,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CoreApiClient } from '../../core-api/infrastructure/core-api.client.js';
import type { FastifyRequest } from 'fastify';

// Eventos do Resend que interessam à entrega dos convites, e a situação correspondente.
const EVENT_STATUSES: Record<string, string> = {
  'email.sent': 'SENT',
  'email.delivery_delayed': 'DELAYED',
  'email.delivered': 'DELIVERED',
  'email.opened': 'OPENED',
  'email.clicked': 'CLICKED',
  'email.bounced': 'BOUNCED',
  'email.complained': 'COMPLAINED',
  'email.failed': 'FAILED',
};

// Diferença máxima entre o horário do evento assinado e o do servidor (contra reenvio de eventos).
const TOLERANCE_SECONDS = 5 * 60;

const header = (request: FastifyRequest, name: string): string => {
  const value = request.headers[name];

  return (Array.isArray(value) ? value[0] : value) ?? '';
};

// Webhook do Resend (ADR 0013): confere a assinatura (padrão Svix, com RESEND_WEBHOOK_SECRET) e
// repassa à Core API a situação de entrega dos e-mails dos formulários. Sem o segredo configurado, a
// rota não existe. E-mails que não são convites (ex.: verificação de conta) são ignorados pela Core.
@Controller('api/v1/webhooks/resend')
export class ResendWebhookController {
  private readonly logger = new Logger(ResendWebhookController.name);

  constructor(
    @Inject(ConfigService) private readonly configService: ConfigService,
    @Inject(CoreApiClient) private readonly coreApi: CoreApiClient,
  ) {}

  @Post()
  @HttpCode(204)
  async receive(@Req() request: RawBodyRequest<FastifyRequest>): Promise<void> {
    const secret = this.configService.get<string>('RESEND_WEBHOOK_SECRET');

    if (!secret) {
      throw new NotFoundException();
    }

    const raw = request.rawBody?.toString('utf8') ?? '';

    this.verify(request, raw, secret);

    const event = JSON.parse(raw) as {
      type?: string;
      created_at?: string;
      data?: { email_id?: string };
    };

    const status = event.type ? EVENT_STATUSES[event.type] : undefined;

    const messageId = event.data?.email_id;

    if (!status || !messageId) {
      return;
    }

    const response = await this.coreApi.send({
      method: 'POST',
      path: 'form-email-events',
      body: {
        messageId,
        status,
        occurredAt: event.created_at ?? new Date().toISOString(),
      },
    });

    if (response.status >= 400) {
      this.logger.warn(`Core API respondeu ${response.status} ao registrar evento de entrega.`);
    }
  }

  private verify(request: FastifyRequest, raw: string, secret: string): void {
    const id = header(request, 'svix-id');

    const timestamp = header(request, 'svix-timestamp');

    const signatures = header(request, 'svix-signature');

    const age = Math.abs(Date.now() / 1000 - Number(timestamp));

    if (!id || !timestamp || !signatures || !Number.isFinite(age) || age > TOLERANCE_SECONDS) {
      throw new UnauthorizedException('Assinatura do webhook inválida.');
    }

    const key = Buffer.from(secret.replace(/^whsec_/u, ''), 'base64');

    const expected = createHmac('sha256', key).update(`${id}.${timestamp}.${raw}`).digest();

    const valid = signatures.split(' ').some((entry) => {
      const [version, signature] = entry.split(',');

      const received = Buffer.from(signature ?? '', 'base64');

      return (
        version === 'v1' &&
        received.length === expected.length &&
        timingSafeEqual(received, expected)
      );
    });

    if (!valid) {
      throw new UnauthorizedException('Assinatura do webhook inválida.');
    }
  }
}
