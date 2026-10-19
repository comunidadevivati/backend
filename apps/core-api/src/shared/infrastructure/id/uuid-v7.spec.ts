import { describe, expect, it } from 'vitest';
import { uuidv7 } from './uuid-v7.js';

describe('uuidv7', () => {
  it('deve gerar um UUID na versão 7 com a variante RFC 9562', () => {
    expect(uuidv7()).toMatch(/^[\da-f]{8}-[\da-f]{4}-7[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/u);
  });

  it('deve codificar o timestamp nos primeiros 48 bits', () => {
    const now = Date.UTC(2026, 9, 16);

    const timestamp = Number.parseInt(uuidv7(now).replaceAll('-', '').slice(0, 12), 16);

    expect(timestamp).toBe(now);
  });

  it('deve gerar identificadores ordenáveis pelo tempo de criação', () => {
    const earlier = uuidv7(1_000);

    const later = uuidv7(2_000);

    expect(earlier < later).toBe(true);
  });
});
