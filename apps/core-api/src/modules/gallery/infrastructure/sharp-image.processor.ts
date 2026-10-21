import sharp from 'sharp';
import { ImageProcessor, type ImageVariant, type ProcessedImage } from '../application/ports.js';
import { variantWidthsFor } from '../domain/photo.js';

// Uma operação por vez e sem cache de libvips: o Render Free tem pouca CPU e memória (ADR 0010).
sharp.concurrency(1);

sharp.cache(false);

// Lado maior do original reduzido guardado na área privada.
const ORIGINAL_MAX_SIDE = 4096;

// Fotos acima disto (ex.: panoramas gigantes) são recusadas antes de decodificar.
const MAX_INPUT_PIXELS = 100_000_000;

const PLACEHOLDER_WIDTH = 16;

const ACCEPTED_FORMATS = new Set(['jpeg', 'png', 'webp']);

const toBytes = (buffer: Buffer): Uint8Array =>
  new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);

// Valida o conteúdo real, aplica a rotação do EXIF e remove todos os metadados (inclusive GPS):
// a saída do sharp não carrega EXIF, ICC de câmera nem XMP, salvo pedido explícito.
export class SharpImageProcessor extends ImageProcessor {
  async process(input: Uint8Array): Promise<ProcessedImage | null> {
    try {
      const { format } = await sharp(input, { limitInputPixels: MAX_INPUT_PIXELS }).metadata();

      if (!format || !ACCEPTED_FORMATS.has(format)) {
        return null;
      }

      const { data: original, info } = await sharp(input, {
        limitInputPixels: MAX_INPUT_PIXELS,
        failOn: 'error',
      })
        .rotate()
        .resize({
          width: ORIGINAL_MAX_SIDE,
          height: ORIGINAL_MAX_SIDE,
          fit: 'inside',
          withoutEnlargement: true,
        })
        .flatten({ background: '#ffffff' })
        .jpeg({ quality: 90, mozjpeg: true })
        .toBuffer({ resolveWithObject: true });

      const variants: ImageVariant[] = [];

      // Um formato por vez: AVIF e WebP em paralelo passavam de 512 MB na instância free e o
      // processo era encerrado por falta de memória.
      for (const width of variantWidthsFor(info.width)) {
        const resized = sharp(original).resize({ width, withoutEnlargement: true });

        // oxlint-disable-next-line no-await-in-loop -- codificação sequencial, sem picos de memória
        const avif = await resized.clone().avif({ quality: 50, effort: 2 }).toBuffer();

        // oxlint-disable-next-line no-await-in-loop -- codificação sequencial, sem picos de memória
        const webp = await resized.clone().webp({ quality: 75 }).toBuffer();

        variants.push(
          { width, format: 'avif', body: toBytes(avif) },
          { width, format: 'webp', body: toBytes(webp) },
        );
      }

      const placeholder = await sharp(original)
        .resize({ width: PLACEHOLDER_WIDTH })
        .webp({ quality: 40 })
        .toBuffer();

      return {
        width: info.width,
        height: info.height,
        placeholder: `data:image/webp;base64,${placeholder.toString('base64')}`,
        original: toBytes(original),
        variants,
      };
    } catch {
      // Arquivo corrompido ou que não é imagem: tratado como imagem inválida.
      return null;
    }
  }
}
