import { PublicMediaUrls, type PrivateMediaStorage } from '../application/ports.js';

// Validade das URLs assinadas usadas enquanto o domínio público não existe.
const SIGNED_URL_TTL_SECONDS = 60 * 60;

// Domínio público do bucket (CDN): URL permanente, servida com cache de um ano.
export class CdnPublicMediaUrls extends PublicMediaUrls {
  private readonly baseUrl: string;

  constructor(publicBaseUrl: string, keyPrefix: string) {
    super();

    this.baseUrl = `${publicBaseUrl.replace(/\/+$/u, '')}/${encodeURIComponent(keyPrefix)}`;
  }

  urlOf(key: string): Promise<string | null> {
    return Promise.resolve(`${this.baseUrl}/${key}`);
  }
}

// Sem domínio público (desenvolvimento local e homologação antes do domínio): URL assinada de
// validade curta. Não aproveita o cache da CDN; serve para exibir e testar o site.
export class SignedPublicMediaUrls extends PublicMediaUrls {
  constructor(private readonly storage: PrivateMediaStorage) {
    super();
  }

  urlOf(key: string): Promise<string | null> {
    return this.storage.enabled
      ? this.storage.presignDownload(key, SIGNED_URL_TTL_SECONDS)
      : Promise.resolve(null);
  }
}
