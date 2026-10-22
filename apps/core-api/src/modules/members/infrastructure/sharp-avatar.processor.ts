import sharp from 'sharp';
import { AvatarProcessor } from '../application/ports.js';

// Lado da foto de perfil gravada (quadrada): cobre o avatar do cabeçalho e o do Perfil em telas densas.
const AVATAR_SIDE = 512;

// Fotos acima disto são recusadas antes de decodificar.
const MAX_INPUT_PIXELS = 100_000_000;

const ACCEPTED_FORMATS = new Set(['jpeg', 'png', 'webp']);

// Valida o conteúdo real, aplica a rotação do EXIF, recorta o centro em quadrado e grava WebP sem
// metadados (a saída do sharp não carrega EXIF nem GPS). As opções globais do sharp (uma operação por
// vez, sem cache) são definidas pela galeria e valem para o processo todo.
export class SharpAvatarProcessor extends AvatarProcessor {
  async process(input: Uint8Array): Promise<Uint8Array | null> {
    try {
      const { format } = await sharp(input, { limitInputPixels: MAX_INPUT_PIXELS }).metadata();

      if (!format || !ACCEPTED_FORMATS.has(format)) {
        return null;
      }

      const avatar = await sharp(input, { limitInputPixels: MAX_INPUT_PIXELS, failOn: 'error' })
        .rotate()
        .resize({ width: AVATAR_SIDE, height: AVATAR_SIDE, fit: 'cover', position: 'attention' })
        .flatten({ background: '#ffffff' })
        .webp({ quality: 80 })
        .toBuffer();

      return new Uint8Array(avatar.buffer, avatar.byteOffset, avatar.byteLength);
    } catch {
      // Arquivo corrompido ou que não é imagem: tratado como imagem inválida.
      return null;
    }
  }
}
