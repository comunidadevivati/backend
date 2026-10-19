import { ProblemException } from '../../../shared/presentation/problem-details.js';
import type { Result } from '../../../shared/domain/result.js';
import type { OrganizationError } from '../application/organization-errors.js';

export const throwInvalidFields = (fields: string[]): never => {
  throw new ProblemException(400, 'Dados inválidos.', fields);
};

const toProblem = (error: OrganizationError): ProblemException => {
  switch (error.type) {
    case 'not_found':
      return new ProblemException(404, 'Registro não encontrado.');

    case 'invalid_fields':
      return new ProblemException(400, 'Dados inválidos.', error.fields);

    case 'version_conflict':
      return new ProblemException(
        409,
        'O registro foi alterado por outra operação. Recarregue os dados e tente novamente.',
      );

    case 'invalid_status_transition':
      return new ProblemException(409, 'A situação atual não permite esta operação.');

    case 'code_taken':
      return new ProblemException(409, 'Já existe uma congregação com este código.');

    case 'organization_inactive':
      return new ProblemException(409, 'A organização está inativa.');
  }
};

// Devolve o valor do resultado ou lança o Problem Details correspondente ao erro esperado.
export const unwrap = <T>(result: Result<T, OrganizationError>): T => {
  if (!result.ok) {
    throw toProblem(result.error);
  }

  return result.value;
};
