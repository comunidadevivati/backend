import { describe, expect, it } from 'vitest';
import { HealthController } from './health.controller.js';

describe('HealthController', () => {
  it('deve retornar status ok', () => {
    expect(new HealthController().check()).toEqual({ status: 'ok' });
  });
});
