import { describe, expect, it } from 'vitest';
import { getSessionCookieName } from './session-cookie.constants.js';

describe('getSessionCookieName', () => {
  it('deve usar o prefixo __Host- em conexões seguras', () => {
    expect(getSessionCookieName(true)).toBe('__Host-comvivati-session');
  });

  it('deve usar o nome simples em conexões inseguras', () => {
    expect(getSessionCookieName(false)).toBe('comvivati_session');
  });
});
