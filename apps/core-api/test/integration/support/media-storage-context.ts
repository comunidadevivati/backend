// Emulador S3 (versitygw) em container para os testes da galeria (ADR 0010). Sobe antes de a Core
// API carregar (registerBeforeAppStart) e configura MEDIA_STORAGE=s3.
import { AwsClient } from 'aws4fetch';
import { GenericContainer, Wait, type StartedTestContainer } from 'testcontainers';
import { afterAll } from 'vitest';
import { registerBeforeAppStart } from './core-api-test-context.js';

const ACCESS_KEY = 'gallery-test-access';

const SECRET_KEY = 'gallery-test-secret-key';

const REGION = 'us-east-1';

export const MEDIA_BUCKET = 'comunidade-viva-media';

// Pasta do ambiente de teste dentro do bucket.
export const KEY_PREFIX = 'test';

let container: StartedTestContainer;

export let mediaEndpoint: string;

export let mediaClient: AwsClient;

export const objectUrl = (key: string) => `${mediaEndpoint}/${MEDIA_BUCKET}/${KEY_PREFIX}/${key}`;

registerBeforeAppStart(async () => {
  container = await new GenericContainer('versity/versitygw:v1.8.0')
    .withEnvironment({
      ROOT_ACCESS_KEY: ACCESS_KEY,
      ROOT_SECRET_KEY: SECRET_KEY,
      VGW_REGION: REGION,
      VGW_CORS_ALLOW_ORIGIN: 'http://localhost:5173',
    })
    .withCommand(['posix', '/tmp'])
    .withExposedPorts(7070)
    .withWaitStrategy(Wait.forListeningPorts())
    .start();

  mediaEndpoint = `http://${container.getHost()}:${container.getMappedPort(7070)}`;

  mediaClient = new AwsClient({
    accessKeyId: ACCESS_KEY,
    secretAccessKey: SECRET_KEY,
    region: REGION,
    service: 's3',
  });

  const created = await mediaClient.fetch(`${mediaEndpoint}/${MEDIA_BUCKET}`, { method: 'PUT' });

  if (!created.ok) {
    throw new Error(`Não foi possível criar o bucket de teste (${created.status}).`);
  }

  Object.assign(process.env, {
    MEDIA_STORAGE: 's3',
    MEDIA_S3_ENDPOINT: mediaEndpoint,
    MEDIA_S3_REGION: REGION,
    MEDIA_S3_ACCESS_KEY_ID: ACCESS_KEY,
    MEDIA_S3_SECRET_ACCESS_KEY: SECRET_KEY,
    MEDIA_BUCKET,
    MEDIA_KEY_PREFIX: KEY_PREFIX,
  });
});

afterAll(async () => {
  await container?.stop();
});
