import { Injectable } from '@nestjs/common';
import PdfKitDocument from 'pdfkit';
import { BRAND_NAME } from '../../auth/infrastructure/email/email-layout.template.js';
import {
  FormPrintout,
  type FormPrintoutContent,
  type PrintoutFieldType,
  type PrintoutQuestion,
} from '../application/form-printout.js';

const MARGIN = 50;

const colors = {
  heading: '#042f2e',
  text: '#134e4a',
  muted: '#5c6b73',
  line: '#99a6ad',
  required: '#b42318',
} as const;

// Altura reservada para a resposta de cada tipo de pergunta de texto.
const ANSWER_HEIGHT = { INPUT: 26, TEXTAREA: 110, DATE: 26, NUMBER: 26 } as const;

const OPTION_HEIGHT = 18;

const SCALE_HEIGHT = 44;

// Escala com nome em cada ponto: espaço para até duas linhas sob os números.
const SCALE_POINTS_HEIGHT = 58;

const MAX_BOXED_HEIGHT = 500;

const QR_SIZE = 72;

// Na versão em branco, como marcar cada tipo.
const HINTS: Partial<Record<PrintoutFieldType, string>> = {
  CHECKBOX: 'Marque quantas opções quiser.',
  RADIO: 'Marque somente uma opção.',
  SELECT: 'Marque somente uma opção.',
  SCALE: 'Circule um número.',
  DATE: 'Escreva a data (dd/mm/aaaa).',
  NUMBER: 'Escreva um número.',
};

// AAAA-MM-DD → DD/MM/AAAA (datas civis, sem fuso).
const formatDate = (value: string): string => value.split('-').toReversed().join('/');

type Doc = InstanceType<typeof PdfKitDocument>;

type TextFieldType = keyof typeof ANSWER_HEIGHT;

// Começa nova página quando o bloco não cabe no espaço que resta.
const ensureSpace = (doc: Doc, height: number) => {
  if (doc.y + height > doc.page.height - doc.page.margins.bottom) {
    doc.addPage();
  }
};

const field = (doc: Doc, label: string, value: string, x: number, width: number) => {
  const y = doc.y;

  doc.font('Helvetica-Bold').fontSize(9).fillColor(colors.muted).text(label, x, y, { width });

  doc
    .font('Helvetica')
    .fontSize(11)
    .fillColor(colors.text)
    .text(value, x, y + 13, { width, lineBreak: false, ellipsis: true });

  doc
    .moveTo(x, y + 28)
    .lineTo(x + width, y + 28)
    .strokeColor(colors.line)
    .lineWidth(0.7)
    .stroke();
};

// Texto exibido na caixa de uma pergunta de texto, data ou número já respondida.
const textOf = ({ answerText, answerValue, fieldType }: PrintoutQuestion): string => {
  if (fieldType === 'NUMBER') {
    return answerValue === null || answerValue === undefined
      ? ''
      : answerValue.toLocaleString('pt-BR');
  }

  if (fieldType === 'DATE') {
    return answerText ? formatDate(answerText) : '';
  }

  return answerText ?? '';
};

// PDF A4 do formulário: cabeçalho com título, período e descrição, nome e e-mail de quem responde
// e, para cada pergunta, o espaço da resposta (caixas, opções de marcar, escala para circular). Na
// versão respondida, as respostas digitais vêm preenchidas; na versão em branco, um QR code leva ao
// link pessoal.
@Injectable()
export class PdfkitFormPrintout extends FormPrintout {
  render(content: FormPrintoutContent): Promise<Uint8Array> {
    const doc = new PdfKitDocument({
      size: 'A4',
      margin: MARGIN,
      info: { Title: content.title, Author: BRAND_NAME },
    });

    const chunks: Buffer[] = [];

    const done = new Promise<Uint8Array>((resolve, reject) => {
      doc.on('data', (chunk: Buffer) => chunks.push(chunk));

      doc.on('end', () => resolve(new Uint8Array(Buffer.concat(chunks))));

      doc.on('error', reject);
    });

    this.draw(doc, content);

    doc.end();

    return done;
  }

  private draw(doc: Doc, content: FormPrintoutContent) {
    const { answered, consentText, description, endsOn, qrCode, questions, recipient, startsOn } =
      content;

    const width = doc.page.width - MARGIN * 2;

    // Com QR code, o cabeçalho deixa espaço à direita para ele.
    const headerWidth = qrCode ? width - QR_SIZE - 16 : width;

    if (qrCode) {
      doc.image(Buffer.from(qrCode), MARGIN + width - QR_SIZE, MARGIN - 6, { width: QR_SIZE });

      doc
        .font('Helvetica')
        .fontSize(7)
        .fillColor(colors.muted)
        .text('Responda pelo celular', MARGIN + width - QR_SIZE, MARGIN + QR_SIZE - 4, {
          width: QR_SIZE,
          align: 'center',
        });

      doc.x = MARGIN;

      doc.y = MARGIN;
    }

    doc.font('Helvetica').fontSize(9).fillColor(colors.muted).text(BRAND_NAME.toUpperCase(), {
      characterSpacing: 1,
      width: headerWidth,
    });

    doc.moveDown(0.6);

    doc
      .font('Helvetica-Bold')
      .fontSize(18)
      .fillColor(colors.heading)
      .text(content.title, { width: headerWidth });

    doc.moveDown(0.3);

    doc
      .font('Helvetica')
      .fontSize(10)
      .fillColor(colors.muted)
      .text(
        answered
          ? `Respondido pelo link em ${answered.at}`
          : `Período para responder: ${formatDate(startsOn)} a ${formatDate(endsOn)}`,
        { width: headerWidth },
      );

    if (description) {
      doc.moveDown(0.6);

      doc.fontSize(11).fillColor(colors.text).text(description, { width: headerWidth, lineGap: 2 });
    }

    doc.y = Math.max(doc.y, qrCode ? MARGIN + QR_SIZE + 10 : 0);

    doc.moveDown(1.2);

    const half = (width - 20) / 2;

    const top = doc.y;

    field(doc, 'NOME', recipient.name, MARGIN, half);

    doc.y = top;

    field(doc, 'E-MAIL', recipient.email, MARGIN + half + 20, half);

    doc.x = MARGIN;

    doc.y = top + 48;

    if (questions.some(({ required }) => required)) {
      doc
        .font('Helvetica')
        .fontSize(9)
        .fillColor(colors.muted)
        .text('* Pergunta obrigatória', MARGIN, doc.y, { width });

      doc.moveDown(0.8);
    }

    questions.forEach((question, index) =>
      this.drawQuestion(doc, question, index, width, Boolean(answered)),
    );

    if (consentText) {
      this.drawConsent(doc, consentText, width, Boolean(answered));
    }

    if (answered) {
      return;
    }

    ensureSpace(doc, 40);

    doc.moveDown(1);

    doc
      .font('Helvetica-Oblique')
      .fontSize(9)
      .fillColor(colors.muted)
      .text('Se preferir, responda pelo link pessoal enviado por e-mail.', MARGIN, doc.y, {
        width,
        align: 'center',
      });
  }

  // Altura da caixa de uma resposta de texto: a padrão do tipo ou a do texto respondido.
  private textBoxHeight(doc: Doc, fieldType: TextFieldType, text: string, width: number) {
    if (!text) {
      return ANSWER_HEIGHT[fieldType];
    }

    doc.font('Helvetica').fontSize(10.5);

    return Math.max(ANSWER_HEIGHT.INPUT, doc.heightOfString(text, { width: width - 16 }) + 14);
  }

  private answerHeight(doc: Doc, question: PrintoutQuestion, width: number): number {
    switch (question.fieldType) {
      case 'CHECKBOX':

      case 'RADIO':

      case 'SELECT':
        return question.options.length * OPTION_HEIGHT;

      case 'SCALE':
        return question.scale?.pointLabels ? SCALE_POINTS_HEIGHT : SCALE_HEIGHT;

      default:
        return this.textBoxHeight(doc, question.fieldType, textOf(question), width);
    }
  }

  private drawQuestion(
    doc: Doc,
    question: PrintoutQuestion,
    index: number,
    width: number,
    answered: boolean,
  ) {
    const { description, fieldType, required, title } = question;

    const answerHeight = this.answerHeight(doc, question, width);

    ensureSpace(doc, 40 + Math.min(answerHeight, MAX_BOXED_HEIGHT));

    doc
      .font('Helvetica-Bold')
      .fontSize(11)
      .fillColor(colors.heading)
      .text(`${index + 1}. ${title}`, MARGIN, doc.y, { width, continued: required });

    if (required) {
      doc.fillColor(colors.required).text(' *');
    }

    const notes = [description, answered ? null : HINTS[fieldType]].filter(Boolean).join(' ');

    if (notes) {
      doc.font('Helvetica-Oblique').fontSize(9).fillColor(colors.muted).text(notes, { width });
    }

    doc.moveDown(0.5);

    doc.strokeColor(colors.line).lineWidth(0.8);

    if (fieldType === 'CHECKBOX' || fieldType === 'RADIO' || fieldType === 'SELECT') {
      this.drawOptions(doc, question, width);
    } else if (fieldType === 'SCALE') {
      this.drawScale(doc, question, width);
    } else {
      this.drawTextBox(doc, textOf(question), answerHeight, width);
    }

    doc.x = MARGIN;

    doc.moveDown(1);
  }

  private drawOptions(doc: Doc, { fieldType, options }: PrintoutQuestion, width: number) {
    const round = fieldType !== 'CHECKBOX';

    options.forEach(({ label, selected = false }) => {
      const y = doc.y;

      if (round) {
        doc.circle(MARGIN + 6, y + 6, 5.5).stroke();
      } else {
        doc.rect(MARGIN + 0.5, y + 0.5, 11, 11).stroke();
      }

      // Opção marcada na resposta digital: preenchida.
      if (selected && round) {
        doc.circle(MARGIN + 6, y + 6, 3).fill(colors.heading);
      } else if (selected) {
        doc.rect(MARGIN + 3, y + 3, 6, 6).fill(colors.heading);
      }

      doc
        .font('Helvetica')
        .fontSize(10.5)
        .fillColor(colors.text)
        .text(label, MARGIN + 20, y, { width: width - 20 });

      doc.y = Math.max(doc.y, y + OPTION_HEIGHT);
    });
  }

  // Números da escala lado a lado, para circular; o respondido vem preenchido.
  private drawScale(doc: Doc, { answerValue, scale }: PrintoutQuestion, width: number) {
    if (!scale) {
      return;
    }

    const count = scale.max - scale.min + 1;

    const { pointLabels } = scale;

    // Com nomes por ponto, cada número fica no centro da sua coluna, com o nome embaixo.
    const step = Math.min(pointLabels ? 84 : 44, width / count);

    const top = doc.y;

    for (let value = scale.min; value <= scale.max; value += 1) {
      const x = MARGIN + (value - scale.min) * step + (pointLabels ? step / 2 : 11);

      const isAnswer = value === answerValue;

      doc
        .circle(x, top + 11, 10)
        .lineWidth(0.8)
        .strokeColor(colors.line);

      if (isAnswer) {
        doc.fillAndStroke(colors.heading, colors.heading);
      } else {
        doc.stroke();
      }

      doc
        .font('Helvetica-Bold')
        .fontSize(9.5)
        .fillColor(isAnswer ? '#ffffff' : colors.text)
        .text(String(value), x - 10, top + 7, { width: 20, align: 'center' });
    }

    doc.font('Helvetica').fontSize(8.5).fillColor(colors.muted);

    if (pointLabels) {
      pointLabels.forEach((label, offset) => {
        doc.text(label, MARGIN + offset * step + 2, top + 26, {
          width: step - 4,
          align: 'center',
          height: 22,
          ellipsis: true,
        });
      });

      doc.y = top + SCALE_POINTS_HEIGHT;

      return;
    }

    if (scale.minLabel) {
      doc.text(scale.minLabel, MARGIN, top + 26, { width: width / 2 });
    }

    if (scale.maxLabel) {
      const right = MARGIN + (count - 1) * step + 22;

      doc.text(scale.maxLabel, right - width / 2, top + 26, { width: width / 2, align: 'right' });
    }

    doc.y = top + SCALE_HEIGHT;
  }

  private drawTextBox(doc: Doc, text: string, height: number, width: number) {
    const top = doc.y;

    // Resposta longa demais para uma página: o texto quebra entre páginas, sem a caixa.
    if (height <= MAX_BOXED_HEIGHT) {
      doc.roundedRect(MARGIN, top, width, height, 4).stroke();
    }

    if (text) {
      doc
        .font('Helvetica')
        .fontSize(10.5)
        .fillColor(colors.text)
        .text(text, MARGIN + 8, top + 7, { width: width - 16 });
    }

    doc.y = top + height;
  }

  private drawConsent(doc: Doc, consentText: string, width: number, accepted: boolean) {
    doc.font('Helvetica').fontSize(9.5);

    ensureSpace(doc, doc.heightOfString(consentText, { width: width - 20 }) + 40);

    doc.moveDown(0.5);

    const y = doc.y;

    doc
      .rect(MARGIN + 0.5, y + 0.5, 11, 11)
      .strokeColor(colors.line)
      .lineWidth(0.8)
      .stroke();

    if (accepted) {
      doc.rect(MARGIN + 3, y + 3, 6, 6).fill(colors.heading);
    }

    doc
      .font('Helvetica-Bold')
      .fontSize(10.5)
      .fillColor(colors.heading)
      .text('Li e aceito', MARGIN + 20, y, { width: width - 20 });

    doc
      .font('Helvetica')
      .fontSize(9.5)
      .fillColor(colors.text)
      .text(consentText, MARGIN + 20, doc.y + 2, { width: width - 20, lineGap: 1.5 });

    doc.x = MARGIN;

    doc.moveDown(1);
  }
}
