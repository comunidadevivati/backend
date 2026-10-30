import sharp from 'sharp';
import { HeaderImageProcessor, type ProcessedHeaderImage } from '../application/ports.js';

// Exibida em até 800 x 600 px: guarda o dobro para telas densas, sem ampliar imagens menores.
const MAX_WIDTH = 1600;

const MAX_HEIGHT = 1200;

// Imagens acima disto são recusadas antes de decodificar.
const MAX_INPUT_PIXELS = 100_000_000;

const ACCEPTED_FORMATS = new Set(['jpeg', 'png', 'webp']);

// Valida o conteúdo real, aplica a rotação do EXIF, reduz para caber no limite e grava WebP sem
// metadados (a saída do sharp não carrega EXIF nem GPS). A transparência do PNG é mantida.
export class SharpHeaderImageProcessor extends HeaderImageProcessor {
  async process(input: Uint8Array): Promise<ProcessedHeaderImage | null> {
    try {
      const { format } = await sharp(input, { limitInputPixels: MAX_INPUT_PIXELS }).metadata();

      if (!format || !ACCEPTED_FORMATS.has(format)) {
        return null;
      }

      const { data, info } = await sharp(input, {
        limitInputPixels: MAX_INPUT_PIXELS,
        failOn: 'error',
      })
        .rotate()
        .resize({ width: MAX_WIDTH, height: MAX_HEIGHT, fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 82 })
        .toBuffer({ resolveWithObject: true });

      return {
        body: new Uint8Array(data.buffer, data.byteOffset, data.byteLength),
        width: info.width,
        height: info.height,
      };
    } catch {
      // Arquivo corrompido ou que não é imagem: tratado como imagem inválida.
      return null;
    }
  }
}
