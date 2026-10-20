import {
  Catch,
  HttpException,
  HttpStatus,
  Logger,
  type ArgumentsHost,
  type ExceptionFilter,
} from '@nestjs/common';
import type { FastifyReply } from 'fastify';

// RFC 9457: corpo de erro padronizado, servido como application/problem+json.
interface ProblemDetails {
  type: string;
  title: string;
  status: number;
  detail?: string;
  // Somente os nomes dos campos recusados, nunca os valores enviados.
  fields?: string[];
}

const TITLES: Record<number, string> = {
  400: 'Requisição inválida',
  401: 'Não autenticado',
  403: 'Acesso negado',
  404: 'Recurso não encontrado',
  409: 'Conflito',
  500: 'Erro interno',
  503: 'Serviço indisponível',
};

export class ProblemException extends HttpException {
  constructor(status: number, detail: string, fields?: string[]) {
    const problem: ProblemDetails = {
      type: 'about:blank',
      title: TITLES[status] ?? 'Erro',
      status,
      detail,
      ...(fields ? { fields } : {}),
    };

    super(problem, status);
  }
}

const toProblem = (exception: unknown): ProblemDetails => {
  if (!(exception instanceof HttpException)) {
    return {
      type: 'about:blank',
      title: TITLES[500] ?? 'Erro',
      status: HttpStatus.INTERNAL_SERVER_ERROR,
    };
  }

  const response = exception.getResponse();

  if (typeof response === 'object' && 'title' in response) {
    return response as ProblemDetails;
  }

  const status = exception.getStatus();

  return {
    type: 'about:blank',
    title: TITLES[status] ?? 'Erro',
    status,
    detail: exception.message,
  };
};

@Catch()
export class ProblemDetailsFilter implements ExceptionFilter {
  private readonly logger = new Logger(ProblemDetailsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const problem = toProblem(exception);

    if (problem.status >= 500) {
      // Somente a mensagem: detalhes internos não vão para a resposta.
      this.logger.error(exception instanceof Error ? exception.message : 'Erro desconhecido.');
    }

    void host
      .switchToHttp()
      .getResponse<FastifyReply>()
      .status(problem.status)
      .header('Content-Type', 'application/problem+json; charset=utf-8')
      .send(problem);
  }
}
