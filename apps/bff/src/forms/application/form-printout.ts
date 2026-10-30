export type PrintoutFieldType =
  | 'INPUT'
  | 'TEXTAREA'
  | 'CHECKBOX'
  | 'RADIO'
  | 'SELECT'
  | 'SCALE'
  | 'DATE'
  | 'NUMBER';

export interface PrintoutQuestion {
  title: string;
  description: string | null;
  fieldType: PrintoutFieldType;
  required: boolean;
  options: { label: string; selected?: boolean }[];
  scale: {
    min: number;
    max: number;
    minLabel: string | null;
    maxLabel: string | null;
    // Um nome por ponto (ex.: Péssimo … Ótimo); impresso sob cada número.
    pointLabels: string[] | null;
  } | null;
  // Respostas (só no PDF respondido): texto (texto e data AAAA-MM-DD) ou valor (escala e número).
  answerText?: string | null;
  answerValue?: number | null;
}

// Conteúdo do PDF de um formulário, com nome e e-mail de quem responde. Sem `answered`, é a versão
// em branco para imprimir e preencher à mão; com ele, as respostas digitais vêm preenchidas.
export interface FormPrintoutContent {
  title: string;
  description: string | null;
  startsOn: string;
  endsOn: string;
  questions: PrintoutQuestion[];
  recipient: { name: string; email: string };
  // Texto de consentimento (LGPD), impresso ao final com o campo de aceite.
  consentText: string | null;
  // Data e hora da resposta, já formatadas.
  answered?: { at: string };
  // QR code (PNG) do link pessoal de resposta, na versão em branco.
  qrCode?: Uint8Array;
}

// Classe abstrata para servir também de token de injeção.
export abstract class FormPrintout {
  abstract render(content: FormPrintoutContent): Promise<Uint8Array>;
}
