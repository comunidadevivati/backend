import { Injectable } from '@nestjs/common';
import PdfKitDocument from 'pdfkit';
import { BRAND_NAME } from '../../auth/infrastructure/email/email-layout.template.js';
import { FormReportPrintout, type ReportContent } from '../application/form-report-printout.js';

const MARGIN = 50;

const colors = {
  heading: '#042f2e',
  text: '#134e4a',
  muted: '#5c6b73',
  track: '#e6efee',
  bar: '#0f766e',
  line: '#ccd5d9',
} as const;

// Respostas de texto listadas por pergunta no PDF (o restante fica no CSV).
const MAX_TEXTS = 40;

type Doc = InstanceType<typeof PdfKitDocument>;

const ensureSpace = (doc: Doc, height: number) => {
  if (doc.y + height > doc.page.height - doc.page.margins.bottom) {
    doc.addPage();
  }
};

const percent = (count: number, total: number): string =>
  total === 0 ? '0%' : `${Math.round((count / total) * 100)}%`;

const number = (value: number): string =>
  value.toLocaleString('pt-BR', { maximumFractionDigits: 2 });

// Nome do ponto mais próximo da média, na escala com nomes por ponto (" (Bom)").
const averageLabel = ({ average, scale }: ReportContent['questions'][number]): string => {
  const label =
    average !== null && scale?.pointLabels
      ? scale.pointLabels[Math.round(average) - (scale.distribution[0]?.value ?? 0)]
      : undefined;

  return label ? ` (${label})` : '';
};

// Relatório consolidado A4: resumo da participação e, por pergunta, barras com quantidade e
// porcentagem (escolhas e escala), média/mínimo/máximo (números) e as respostas de texto.
@Injectable()
export class PdfkitFormReport extends FormReportPrintout {
  render(content: ReportContent): Promise<Uint8Array> {
    const doc = new PdfKitDocument({
      size: 'A4',
      margin: MARGIN,
      info: { Title: `Relatório - ${content.title}`, Author: BRAND_NAME },
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

  private draw(doc: Doc, content: ReportContent) {
    const width = doc.page.width - MARGIN * 2;

    doc
      .font('Helvetica')
      .fontSize(9)
      .fillColor(colors.muted)
      .text(`${BRAND_NAME.toUpperCase()} · RELATÓRIO`, { characterSpacing: 1 });

    doc.moveDown(0.6);

    doc
      .font('Helvetica-Bold')
      .fontSize(18)
      .fillColor(colors.heading)
      .text(content.title, { width });

    doc.moveDown(0.3);

    doc
      .font('Helvetica')
      .fontSize(10)
      .fillColor(colors.muted)
      .text(
        `Período: ${content.period}${content.anonymous ? ' · Pesquisa anônima' : ''} · Gerado em ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Campo_Grande' })}`,
        { width },
      );

    doc.moveDown(1);

    this.drawSummary(doc, content, width);

    content.questions.forEach((question, index) => this.drawQuestion(doc, question, index, width));
  }

  private drawSummary(doc: Doc, content: ReportContent, width: number) {
    const answered = content.digitalCount + content.paperCount;

    const tiles = [
      { label: 'Convidados', value: String(content.invitedCount) },
      { label: 'Responderam', value: `${answered} (${percent(answered, content.invitedCount)})` },
      { label: 'Pelo link', value: String(content.digitalCount) },
      { label: 'Em papel', value: String(content.paperCount) },
      { label: 'Pendentes', value: String(content.pendingCount) },
    ];

    const tileWidth = (width - 4 * 8) / tiles.length;

    const top = doc.y;

    tiles.forEach(({ label, value }, index) => {
      const x = MARGIN + index * (tileWidth + 8);

      doc.roundedRect(x, top, tileWidth, 46, 6).fillAndStroke('#f0fdfa', colors.line);

      doc
        .font('Helvetica')
        .fontSize(8)
        .fillColor(colors.muted)
        .text(label.toUpperCase(), x + 8, top + 8, { width: tileWidth - 16 });

      doc
        .font('Helvetica-Bold')
        .fontSize(13)
        .fillColor(colors.heading)
        .text(value, x + 8, top + 22, { width: tileWidth - 16 });
    });

    doc.x = MARGIN;

    doc.y = top + 62;

    if (content.paperCount > 0) {
      doc
        .font('Helvetica-Oblique')
        .fontSize(8.5)
        .fillColor(colors.muted)
        .text(
          'Respostas em papel contam na participação, mas o conteúdo delas está nos anexos (não entra nos gráficos).',
          { width },
        );

      doc.moveDown(0.6);
    }
  }

  // Barra horizontal: rótulo, trilho com a parte preenchida, quantidade e porcentagem.
  private drawBar(doc: Doc, label: string, count: number, total: number, width: number) {
    const labelWidth = width * 0.38;

    const valueWidth = 70;

    const trackWidth = width - labelWidth - valueWidth - 12;

    doc.font('Helvetica').fontSize(9.5);

    const height = Math.max(16, doc.heightOfString(label, { width: labelWidth }) + 4);

    ensureSpace(doc, height);

    const y = doc.y;

    doc.fillColor(colors.text).text(label, MARGIN, y + 2, { width: labelWidth });

    const trackX = MARGIN + labelWidth + 6;

    doc.roundedRect(trackX, y + 3, trackWidth, 10, 4).fill(colors.track);

    const filled = total === 0 ? 0 : (count / total) * trackWidth;

    if (filled > 0) {
      doc.roundedRect(trackX, y + 3, Math.max(filled, 4), 10, 4).fill(colors.bar);
    }

    doc
      .font('Helvetica-Bold')
      .fontSize(9.5)
      .fillColor(colors.heading)
      .text(`${count} · ${percent(count, total)}`, trackX + trackWidth + 6, y + 2, {
        width: valueWidth,
        align: 'right',
      });

    doc.x = MARGIN;

    doc.y = y + height + 2;
  }

  private drawQuestion(
    doc: Doc,
    question: ReportContent['questions'][number],
    index: number,
    width: number,
  ) {
    ensureSpace(doc, 70);

    doc.moveDown(0.6);

    doc
      .moveTo(MARGIN, doc.y)
      .lineTo(MARGIN + width, doc.y)
      .strokeColor(colors.line)
      .lineWidth(0.6)
      .stroke();

    doc.moveDown(0.5);

    doc
      .font('Helvetica-Bold')
      .fontSize(11.5)
      .fillColor(colors.heading)
      .text(`${index + 1}. ${question.title}`, MARGIN, doc.y, { width });

    doc
      .font('Helvetica')
      .fontSize(9)
      .fillColor(colors.muted)
      .text(`${question.answeredCount} resposta(s)`, { width });

    doc.moveDown(0.4);

    if (question.options.length > 0) {
      // Múltipla escolha: a porcentagem é sobre quem respondeu a pergunta (a soma passa de 100%).
      question.options.forEach(({ count, label }) =>
        this.drawBar(doc, label, count, question.answeredCount, width),
      );
    }

    if (question.scale) {
      const { distribution, maxLabel, minLabel, pointLabels } = question.scale;

      // Com nomes por ponto, cada barra mostra o número e o nome ("4 · Bom").
      distribution.forEach(({ count, value }, offset) =>
        this.drawBar(
          doc,
          pointLabels?.[offset] ? `${value} · ${pointLabels[offset]}` : String(value),
          count,
          question.answeredCount,
          width,
        ),
      );

      // Rótulos das pontas ("1 = Ruim · 5 = Ótimo"); as fontes padrão do PDF não têm setas.
      const ends = pointLabels
        ? ''
        : [
            minLabel ? `${distribution.at(0)?.value ?? ''} = ${minLabel}` : null,
            maxLabel ? `${distribution.at(-1)?.value ?? ''} = ${maxLabel}` : null,
          ]
            .filter(Boolean)
            .join(' · ');

      if (ends) {
        doc.font('Helvetica-Oblique').fontSize(8.5).fillColor(colors.muted).text(ends, { width });
      }
    }

    if (question.average !== null) {
      const stats = [
        `Média: ${number(question.average)}${averageLabel(question)}`,
        question.minimum === null ? null : `Mínimo: ${number(question.minimum)}`,
        question.maximum === null ? null : `Máximo: ${number(question.maximum)}`,
      ].filter(Boolean);

      doc
        .font('Helvetica-Bold')
        .fontSize(10)
        .fillColor(colors.heading)
        .text(stats.join('   '), { width });
    }

    this.drawTexts(doc, question.texts, width);
  }

  private drawTexts(doc: Doc, texts: readonly string[], width: number) {
    texts.slice(0, MAX_TEXTS).forEach((text) => {
      doc.font('Helvetica').fontSize(9.5);

      ensureSpace(doc, doc.heightOfString(text, { width: width - 12 }) + 6);

      doc.fillColor(colors.muted).text('•', MARGIN, doc.y, { continued: false, width: 10 });

      doc.moveUp();

      doc.fillColor(colors.text).text(text, MARGIN + 12, doc.y, { width: width - 12 });

      doc.moveDown(0.2);
    });

    if (texts.length > MAX_TEXTS) {
      doc
        .font('Helvetica-Oblique')
        .fontSize(9)
        .fillColor(colors.muted)
        .text(`… e mais ${texts.length - MAX_TEXTS} resposta(s) no CSV.`, MARGIN, doc.y, { width });
    }
  }
}
