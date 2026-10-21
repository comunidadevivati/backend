import { Logger } from '@nestjs/common';
import { PublicMediaCache } from '../application/ports.js';

export interface CloudflareCacheConfig {
  // Domínio público do bucket (ex.: https://media-hml.comvivaeficaz.com.br), sem barra final.
  publicBaseUrl: string;
  // Pasta do ambiente no bucket (prod, hml...), parte do caminho da URL pública.
  keyPrefix: string;
  zoneId: string;
  // Token da API do Cloudflare com permissão somente de purge na zona.
  apiToken: string;
}

// Limite de URLs por chamada de purge da API do Cloudflare.
const PURGE_BATCH_SIZE = 30;

const REQUEST_TIMEOUT_MS = 10_000;

// Purge por URL na CDN do domínio público (ADR 0010). Uma falha não desfaz a despublicação (os
// objetos já foram apagados do bucket): fica registrada para purge manual no painel.
export class CloudflarePublicMediaCache extends PublicMediaCache {
  private readonly logger = new Logger(CloudflarePublicMediaCache.name);

  private readonly baseUrl: string;

  constructor(private readonly config: CloudflareCacheConfig) {
    super();

    this.baseUrl = `${config.publicBaseUrl.replace(/\/+$/u, '')}/${encodeURIComponent(config.keyPrefix)}`;
  }

  async purge(keys: readonly string[]): Promise<void> {
    const urls = keys.map((key) => `${this.baseUrl}/${key}`);

    for (let start = 0; start < urls.length; start += PURGE_BATCH_SIZE) {
      try {
        // oxlint-disable-next-line no-await-in-loop -- lotes sucessivos, no limite da API
        const response = await fetch(
          `https://api.cloudflare.com/client/v4/zones/${encodeURIComponent(this.config.zoneId)}/purge_cache`,
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${this.config.apiToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ files: urls.slice(start, start + PURGE_BATCH_SIZE) }),
            signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
          },
        );

        if (!response.ok) {
          this.logger.error(`Purge da CDN recusado com status ${response.status}.`);
        }

        await response.body?.cancel();
      } catch {
        this.logger.error('Falha ao chamar o purge da CDN.');
      }
    }
  }
}

// Sem domínio público configurado não há cache a limpar.
export class NoPublicMediaCache extends PublicMediaCache {
  purge(): Promise<void> {
    return Promise.resolve();
  }
}
