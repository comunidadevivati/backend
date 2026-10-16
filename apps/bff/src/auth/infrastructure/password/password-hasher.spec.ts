import { describe, expect, it } from 'vitest';
import { hashPassword, verifyPassword } from './password-hasher.js';

describe('password-hasher', () => {
  it('deve gerar hash scrypt sem conter a senha original', async () => {
    const hash = await hashPassword('senha-super-secreta');

    expect(hash).toMatch(/^scrypt\$32768\$8\$3\$[\w-]{22}\$[\w-]{86}$/u);

    expect(hash).not.toContain('senha-super-secreta');
  });

  it('deve gerar hashes diferentes para a mesma senha', async () => {
    await expect(hashPassword('mesma-senha')).resolves.not.toBe(await hashPassword('mesma-senha'));
  });

  it('deve validar a senha correta', async () => {
    const hash = await hashPassword('senha-correta');

    await expect(verifyPassword('senha-correta', hash)).resolves.toBe(true);
  });

  it('deve rejeitar uma senha incorreta', async () => {
    const hash = await hashPassword('senha-correta');

    await expect(verifyPassword('senha-errada', hash)).resolves.toBe(false);
  });

  it('deve rejeitar hashes em formato desconhecido', async () => {
    await expect(verifyPassword('qualquer', 'bcrypt$10$abc')).resolves.toBe(false);

    await expect(verifyPassword('qualquer', '')).resolves.toBe(false);
  });

  it('deve rejeitar hashes com tamanho divergente', async () => {
    const hash = await hashPassword('senha-correta');

    const truncated = hash.slice(0, -4);

    await expect(verifyPassword('senha-correta', truncated)).resolves.toBe(false);
  });

  it('deve propagar falhas de parâmetros inválidos', async () => {
    await expect(verifyPassword('senha', 'scrypt$3$8$1$c2FsdA$aGFzaA')).rejects.toThrow();
  });
});
