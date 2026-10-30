import { Inject, Injectable } from '@nestjs/common';
import { CoreApiClient } from '../../core-api/infrastructure/core-api.client.js';
import { FormReportPrintout, type ReportContent } from './form-report-printout.js';

interface CoreQuestion {
  id: string;
  title: string;
  fieldType: string;
  options: { id: string; label: string }[];
  scale: { min: number; pointLabels: string[] | null } | null;
}

interface CoreResponses {
  anonymous: boolean;
  questions: CoreQuestion[];
  rows: {
    name: string | null;
    email: string | null;
    answeredAt: string | null;
    answers: {
      questionId: string;
      text: string | null;
      optionIds: string[];
      value: number | null;
    }[];
  }[];
}

interface CoreForm {
  title: string;
  startsOn: string;
  endsOn: string;
}

export type ExportResult =
  | { status: 'ok'; filename: string; content: Uint8Array; contentType: string }
  | { status: 'not_found' }
  | { status: 'unavailable' };

// Data e hora no fuso da comunidade (Campo Grande/MS).
const DATE_TIME_FORMAT = new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'America/Campo_Grande',
  dateStyle: 'short',
  timeStyle: 'short',
});

const formatDate = (value: string): string => value.split('-').toReversed().join('/');

// Célula CSV sempre entre aspas (aspas internas duplicadas). Valores que começam com =, +, - ou @
// ganham um apóstrofo, para o Excel não os interpretar como fórmula.
const cell = (value: string): string => {
  const safe = /^[=+\-@]/u.test(value) ? `'${value}` : value;

  return `"${safe.replaceAll('"', '""')}"`;
};

const fileNameOf = (title: string, suffix: string): string =>
  `${title}`
    .normalize('NFD')
    .replaceAll(/[̀-ͯ]/gu, '')
    .replaceAll(/[^\w .-]+/gu, '')
    .trim()
    .slice(0, 100)
    .concat(` - ${suffix}`);

// Exportações do relatório (ADR 0013): CSV com uma linha por resposta digital (separador ";" e BOM,
// para abrir direto no Excel em português) e PDF consolidado.
@Injectable()
export class FormReportExportService {
  constructor(
    @Inject(CoreApiClient) private readonly coreApi: CoreApiClient,
    @Inject(FormReportPrintout) private readonly printout: FormReportPrintout,
  ) {}

  async csv(formId: string): Promise<ExportResult> {
    const loaded = await this.load<CoreResponses>(formId, 'responses');

    if (loaded.status !== 'ok') {
      return loaded;
    }

    const { anonymous, questions, rows } = loaded.data;

    const header = [
      ...(anonymous ? [] : ['Nome', 'E-mail', 'Respondido em']),
      ...questions.map(({ title }) => title),
    ];

    const lines = rows.map(({ answeredAt, answers, email, name }) => {
      const byQuestion = new Map(answers.map((answer) => [answer.questionId, answer]));

      const values = questions.map(({ fieldType, id, options, scale }) => {
        const answer = byQuestion.get(id);

        if (!answer) {
          return '';
        }

        if (answer.value !== null) {
          // Escala com nomes por ponto: "4 - Bom".
          const pointLabel = scale?.pointLabels?.[answer.value - scale.min];

          const value = answer.value.toLocaleString('pt-BR');

          return pointLabel ? `${value} - ${pointLabel}` : value;
        }

        if (answer.optionIds.length > 0) {
          return options
            .filter((option) => answer.optionIds.includes(option.id))
            .map(({ label }) => label)
            .join(' | ');
        }

        return fieldType === 'DATE' && answer.text ? formatDate(answer.text) : (answer.text ?? '');
      });

      return [
        ...(anonymous
          ? []
          : [
              name ?? '',
              email ?? '',
              answeredAt ? DATE_TIME_FORMAT.format(new Date(answeredAt)) : '',
            ]),
        ...values,
      ];
    });

    const csv = [header, ...lines]
      .map((line) => line.map((value) => cell(value)).join(';'))
      .join('\r\n');

    return {
      status: 'ok',
      filename: `${fileNameOf(loaded.form.title, 'respostas')}.csv`,
      content: new TextEncoder().encode(`﻿${csv}\r\n`),
      contentType: 'text/csv; charset=utf-8',
    };
  }

  async pdf(formId: string): Promise<ExportResult> {
    const loaded = await this.load<Omit<ReportContent, 'title' | 'period'>>(formId, 'report');

    if (loaded.status !== 'ok') {
      return loaded;
    }

    const content = await this.printout.render({
      ...loaded.data,
      title: loaded.form.title,
      period: `${formatDate(loaded.form.startsOn)} a ${formatDate(loaded.form.endsOn)}`,
    });

    return {
      status: 'ok',
      filename: `${fileNameOf(loaded.form.title, 'relatorio')}.pdf`,
      content,
      contentType: 'application/pdf',
    };
  }

  private async load<T>(
    formId: string,
    resource: 'report' | 'responses',
  ): Promise<{ status: 'ok'; form: CoreForm; data: T } | { status: 'not_found' | 'unavailable' }> {
    const [formResponse, dataResponse] = await Promise.all([
      this.coreApi.send({ method: 'GET', path: `forms/${formId}` }),
      this.coreApi.send({ method: 'GET', path: `forms/${formId}/${resource}` }),
    ]);

    if (formResponse.status === 404 || dataResponse.status === 404) {
      return { status: 'not_found' };
    }

    if (formResponse.status !== 200 || dataResponse.status !== 200) {
      return { status: 'unavailable' };
    }

    return { status: 'ok', form: formResponse.body as CoreForm, data: dataResponse.body as T };
  }
}
