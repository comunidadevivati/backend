import { ProblemException } from '../../../shared/presentation/problem-details.js';
import { resourceIdSchema } from './gallery-request.schemas.js';
import type { Result } from '../../../shared/domain/result.js';
import type { GalleryError } from '../application/gallery-errors.js';

export const throwInvalidFields = (fields: string[]): never => {
  throw new ProblemException(400, 'Dados inválidos.', fields);
};

// Um ID fora do formato UUID não pode existir: responde como inexistente.
export const parseId = (id: string): string => {
  if (!resourceIdSchema.safeParse(id).success) {
    throw new ProblemException(404, 'Registro não encontrado.');
  }

  return id;
};

type Conflict = Exclude<GalleryError['type'], 'not_found' | 'invalid_fields' | 'storage_disabled'>;

const CONFLICTS: Record<Conflict, string> = {
  version_conflict:
    'O registro foi alterado por outra operação. Recarregue os dados e tente novamente.',
  album_archived: 'O álbum está arquivado e não pode ser alterado.',
  album_full: 'O álbum atingiu o limite de 500 fotos.',
  upload_missing: 'O arquivo não chegou ao armazenamento. Envie a foto novamente.',
  upload_too_large: 'O arquivo enviado passa de 25 MB e foi descartado.',
  invalid_photo_status: 'A situação atual da foto não permite esta operação.',
};

const toProblem = (error: GalleryError): ProblemException => {
  switch (error.type) {
    case 'not_found':
      return new ProblemException(404, 'Registro não encontrado.');

    case 'invalid_fields':
      return new ProblemException(400, 'Dados inválidos.', error.fields);

    case 'storage_disabled':
      return new ProblemException(503, 'O armazenamento de fotos não está configurado.');

    default:
      return new ProblemException(409, CONFLICTS[error.type]);
  }
};

// Devolve o valor do resultado ou lança o Problem Details correspondente ao erro esperado.
export const unwrap = <T>(result: Result<T, GalleryError>): T => {
  if (!result.ok) {
    throw toProblem(result.error);
  }

  return result.value;
};
