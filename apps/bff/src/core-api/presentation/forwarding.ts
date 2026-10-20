import { NotFoundException } from '@nestjs/common';
import { z } from 'zod';

// Somente os filtros conhecidos seguem para a Core API, e somente valores de texto simples.
export const pickQuery = (query: unknown, keys: readonly string[]): Record<string, string> =>
  Object.fromEntries(
    keys.flatMap((key) => {
      const value = (query as Record<string, unknown> | undefined)?.[key];

      return typeof value === 'string' ? [[key, value]] : [];
    }),
  );

// O ID compõe o caminho na Core API: só UUIDs são aceitos, sem risco de path traversal.
export const resourcePath = (resource: string, id: string, ...rest: string[]): string => {
  if (!z.uuid().safeParse(id).success) {
    throw new NotFoundException('Registro não encontrado.');
  }

  return [resource, id, ...rest].join('/');
};
