// Conteúdo do relatório consolidado em PDF (dados do relatório da Core API).
export interface ReportContent {
  title: string;
  period: string;
  anonymous: boolean;
  invitedCount: number;
  digitalCount: number;
  paperCount: number;
  pendingCount: number;
  questions: {
    title: string;
    fieldType: string;
    answeredCount: number;
    options: { label: string; count: number }[];
    scale: {
      minLabel: string | null;
      maxLabel: string | null;
      pointLabels: string[] | null;
      distribution: { value: number; count: number }[];
    } | null;
    average: number | null;
    minimum: number | null;
    maximum: number | null;
    texts: string[];
  }[];
}

// Classe abstrata para servir também de token de injeção.
export abstract class FormReportPrintout {
  abstract render(content: ReportContent): Promise<Uint8Array>;
}
