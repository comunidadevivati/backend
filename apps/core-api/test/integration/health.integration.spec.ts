import { describe, expect, it } from 'vitest';
import { app } from './support/core-api-test-context.js';

describe('Health HTTP Integration', () => {
  it('deve retornar HTTP 200 com status ok, sem credencial de serviço', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/v1/health' });

    expect(response.statusCode).toBe(200);

    expect(response.json()).toEqual({ status: 'ok' });
  });
});
