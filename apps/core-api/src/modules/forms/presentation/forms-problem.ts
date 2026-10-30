import { ProblemException } from '../../../shared/presentation/problem-details.js';
import type { Result } from '../../../shared/domain/result.js';
import type { FormsError } from '../application/forms-errors.js';

export const throwInvalidFields = (fields: string[]): never => {
  throw new ProblemException(400, 'Dados do formulário inválidos.', fields);
};

type Conflict = Exclude<
  FormsError['type'],
  | 'not_found'
  | 'invalid_fields'
  | 'storage_disabled'
  | 'upload_too_large'
  | 'invalid_image'
  | 'invitation_not_found'
  | 'invalid_attachment'
>;

// Recusas de regra respondem 409 com a explicação, exibida pelo frontend.
const CONFLICTS: Record<Conflict, string> = {
  version_conflict: 'O formulário foi alterado por outra pessoa. Recarregue e tente de novo.',
  form_closed: 'Formulários finalizados ou cancelados não podem ser alterados.',
  invalid_status_transition: 'Essa mudança de status não é permitida.',
  recipients_required: 'Selecione ao menos um grupo de e-mails no formulário.',
  form_period_ended: 'A data de fim já passou: ajuste o período do formulário.',
  published_form:
    'Formulários publicados não podem ser excluídos: despublique, conclua ou cancele antes.',
  upload_missing: 'A imagem não chegou ao armazenamento. Envie a imagem novamente.',
  form_not_published: 'Publique o formulário antes de enviar os e-mails.',
  emails_sending:
    'Os e-mails do grupo estão sendo enviados. Aguarde o fim do envio para alterar o formulário.',
  dispatch_not_found: 'Este envio de e-mails não está mais em andamento.',
  already_answered: 'Este convite já foi respondido.',
  not_paper_answer: 'Somente respostas marcadas em papel podem ser desfeitas.',
  no_pending_invitations: 'Não há convites pendentes para lembrar.',
  no_pending_recipients: 'Todas as pessoas dos grupos já responderam: não há para quem reenviar.',
  form_not_closed: 'Conclua ou cancele o formulário antes de apagar as respostas.',
  anonymity_locked:
    'O formulário já tem respostas: não é possível ligar ou desligar o anonimato. Duplique o formulário para mudar.',
  form_unavailable: 'Este formulário não está aceitando respostas.',
};

const toProblem = (error: FormsError): ProblemException => {
  switch (error.type) {
    case 'not_found':
      return new ProblemException(404, 'Formulário não encontrado.');

    case 'invalid_fields':
      return new ProblemException(400, 'Dados do formulário inválidos.', error.fields);

    case 'upload_too_large':

    case 'invalid_image':
      return new ProblemException(400, 'Imagem recusada: PNG, JPG, JPEG ou WebP, até 2 MB.', [
        'file',
      ]);

    case 'invalid_attachment':
      return new ProblemException(400, 'Anexo recusado: PDF, JPG ou PNG, até 2 MB.', ['file']);

    case 'invitation_not_found':
      return new ProblemException(
        404,
        'Link inválido ou substituído por um envio mais recente. Use o link do último e-mail.',
      );

    case 'storage_disabled':
      return new ProblemException(503, 'O armazenamento de imagens não está configurado.');

    default:
      return new ProblemException(409, CONFLICTS[error.type]);
  }
};

// Devolve o valor do resultado ou lança o Problem Details correspondente ao erro esperado.
export const unwrap = <T>(result: Result<T, FormsError>): T => {
  if (!result.ok) {
    throw toProblem(result.error);
  }

  return result.value;
};
