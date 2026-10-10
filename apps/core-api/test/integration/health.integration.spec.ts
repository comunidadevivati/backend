import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { afterEach, describe, expect, it } from 'vitest';
import { AppModule } from '../../src/app.module.js';

describe('Health HTTP Integration', () => {
  let app: NestFastifyApplication | undefined;

  afterEach(async () => {
    await app?.close();

    app = undefined;
  });

  it('deve retornar HTTP 200 com status ok', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());

    app.setGlobalPrefix('api/v1');

    await app.init();

    await app.getHttpAdapter().getInstance().ready();

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/health',
    });

    expect(response.statusCode).toBe(200);

    expect(response.json()).toEqual({
      status: 'ok',
    });
  });
});
