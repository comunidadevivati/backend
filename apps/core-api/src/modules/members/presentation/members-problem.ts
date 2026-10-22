import { ProblemException } from '../../../shared/presentation/problem-details.js';
import { resourceIdSchema } from './members-request.schemas.js';
import type { Result } from '../../../shared/domain/result.js';
import type { MembersError } from '../application/members-errors.js';

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

type Conflict = Exclude<MembersError['type'], 'not_found' | 'invalid_fields' | 'storage_disabled'>;

const CONFLICTS: Record<Conflict, string> = {
  version_conflict:
    'O registro foi alterado por outra operação. Recarregue os dados e tente novamente.',
  invalid_status_transition: 'A situação atual não permite esta operação.',
  member_inactive: 'O membro não está ativo.',
  member_has_open_memberships:
    'Encerre os vínculos ativos ou pendentes do membro antes desta operação.',
  congregation_inactive: 'A congregação não está ativa.',
  duplicate_membership: 'O membro já tem um vínculo ativo ou pendente com esta congregação.',
  primary_taken: 'O membro já tem um vínculo principal ativo. Encerre-o antes de ativar outro.',
  upload_missing: 'O arquivo não chegou ao armazenamento. Envie a foto novamente.',
  upload_too_large: 'A foto enviada passa de 10 MB e foi descartada.',
  invalid_image: 'O arquivo enviado não é uma imagem JPEG, PNG ou WebP válida.',
};

const toProblem = (error: MembersError): ProblemException => {
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
export const unwrap = <T>(result: Result<T, MembersError>): T => {
  if (!result.ok) {
    throw toProblem(result.error);
  }

  return result.value;
};
