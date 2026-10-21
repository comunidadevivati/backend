import { AwsClient } from 'aws4fetch';
import { PrivateMediaStorage } from '../application/ports.js';

export interface S3MediaConfig {
  // Endpoint S3 sem o bucket (R2: https://<conta>.r2.cloudflarestorage.com).
  endpoint: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  // Pasta do ambiente (prod, hml...): HML e produção dividem o mesmo bucket.
  keyPrefix: string;
}

// Falha de comunicação ou resposta inesperada do armazenamento (sem expor a chave ou a URL).
export class MediaStorageError extends Error {
  constructor(operation: string, status: number) {
    super(`Armazenamento de mídia respondeu ${status} em ${operation}.`);

    this.name = 'MediaStorageError';
  }
}

const REQUEST_TIMEOUT_MS = 30_000;

// Cada segmento da chave é codificado; as barras separam os "diretórios".
const encodeKey = (key: string): string =>
  key
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');

// Objetos privados da galeria no bucket de mídia do R2 (ou emulador S3), acessados por path-style e
// assinatura SigV4. Toda chave recebe a pasta do ambiente: {keyPrefix}/{chave}.
export class S3PrivateMediaStorage extends PrivateMediaStorage {
  readonly enabled = true;

  private readonly client: AwsClient;

  private readonly baseUrl: string;

  // Origem de uma cópia (CopyObject): /{bucket}/{pasta do ambiente}.
  private readonly copySourcePrefix: string;

  constructor({
    accessKeyId,
    bucket,
    endpoint,
    keyPrefix,
    region,
    secretAccessKey,
  }: S3MediaConfig) {
    super();

    this.client = new AwsClient({
      accessKeyId,
      secretAccessKey,
      region,
      service: 's3',
      retries: 2,
    });

    this.copySourcePrefix = `/${bucket}/${encodeURIComponent(keyPrefix)}`;

    this.baseUrl = `${endpoint.replace(/\/+$/u, '')}${this.copySourcePrefix}`;
  }

  presignUpload(key: string, contentType: string, expiresInSeconds: number): Promise<string> {
    return this.presign('PUT', key, expiresInSeconds, { 'content-type': contentType });
  }

  presignDownload(key: string, expiresInSeconds: number): Promise<string> {
    return this.presign('GET', key, expiresInSeconds);
  }

  async size(key: string): Promise<number | null> {
    const response = await this.send('HEAD', key);

    if (response.status === 404) {
      return null;
    }

    this.assertOk('HEAD', response);

    return Number(response.headers.get('content-length') ?? 0);
  }

  async read(key: string): Promise<Uint8Array | null> {
    const response = await this.send('GET', key);

    if (response.status === 404) {
      return null;
    }

    this.assertOk('GET', response);

    return new Uint8Array(await response.arrayBuffer());
  }

  async write(key: string, body: Uint8Array, contentType: string): Promise<void> {
    const response = await this.send('PUT', key, {
      body,
      headers: { 'content-type': contentType },
    });

    this.assertOk('PUT', response);

    await response.body?.cancel();
  }

  // CopyObject com metadados novos (REPLACE): o destino recebe o próprio Content-Type e
  // Cache-Control, e o conteúdo não passa pela Core API.
  async copy(
    sourceKey: string,
    targetKey: string,
    { cacheControl, contentType }: { contentType: string; cacheControl: string },
  ): Promise<void> {
    const response = await this.send('PUT', targetKey, {
      headers: {
        'x-amz-copy-source': `${this.copySourcePrefix}/${encodeKey(sourceKey)}`,
        'x-amz-metadata-directive': 'REPLACE',
        'content-type': contentType,
        'cache-control': cacheControl,
      },
    });

    this.assertOk('COPY', response);

    await response.body?.cancel();
  }

  // Apagar objeto inexistente não é erro (204/404).
  async delete(keys: readonly string[]): Promise<void> {
    await Promise.all(
      keys.map(async (key) => {
        const response = await this.send('DELETE', key);

        if (response.status !== 404) {
          this.assertOk('DELETE', response);
        }

        await response.body?.cancel();
      }),
    );
  }

  private async presign(
    method: 'GET' | 'PUT',
    key: string,
    expiresInSeconds: number,
    headers: Record<string, string> = {},
  ): Promise<string> {
    const url = new URL(`${this.baseUrl}/${encodeKey(key)}`);

    url.searchParams.set('X-Amz-Expires', String(expiresInSeconds));

    // allHeaders: o aws4fetch não assina Content-Type por padrão; assinado, o R2 recusa envio com
    // outro tipo.
    const signed = await this.client.sign(new Request(url, { method, headers }), {
      aws: { signQuery: true, allHeaders: true },
    });

    return signed.url;
  }

  private send(
    method: 'DELETE' | 'GET' | 'HEAD' | 'PUT',
    key: string,
    init: { body?: Uint8Array; headers?: Record<string, string> } = {},
  ): Promise<Response> {
    return this.client.fetch(`${this.baseUrl}/${encodeKey(key)}`, {
      method,
      ...init,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  }

  private assertOk(operation: string, response: Response): void {
    if (!response.ok) {
      throw new MediaStorageError(operation, response.status);
    }
  }
}

// MEDIA_STORAGE=disabled: os casos de uso respondem "armazenamento indisponível" sem chamar estes
// métodos.
export class DisabledPrivateMediaStorage extends PrivateMediaStorage {
  readonly enabled = false;

  presignUpload(): Promise<string> {
    return this.unavailable();
  }

  presignDownload(): Promise<string> {
    return this.unavailable();
  }

  size(): Promise<number | null> {
    return this.unavailable();
  }

  read(): Promise<Uint8Array | null> {
    return this.unavailable();
  }

  write(): Promise<void> {
    return this.unavailable();
  }

  copy(): Promise<void> {
    return this.unavailable();
  }

  delete(): Promise<void> {
    return this.unavailable();
  }

  private unavailable(): Promise<never> {
    return Promise.reject(new Error('Armazenamento de mídia desativado (MEDIA_STORAGE=disabled).'));
  }
}
