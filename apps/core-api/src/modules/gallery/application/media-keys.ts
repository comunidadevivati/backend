// Chaves dos objetos no bucket de mídia (ADR 0010), relativas à pasta do ambiente. Sempre derivadas
// dos IDs da aplicação, nunca do nome do arquivo enviado. Somente gallery/public/ é servido pelo
// domínio público; as demais chaves ficam fora dele.

export type VariantFormat = 'avif' | 'webp';

export const VARIANT_FORMATS: readonly VariantFormat[] = ['avif', 'webp'];

// Envio bruto do navegador; apagado após o processamento (e por regra de ciclo de vida).
export const uploadKey = (photoId: string): string => `gallery/uploads/${photoId}`;

// Original reduzido (até 4096 px, JPEG, sem metadados).
export const originalKey = (albumId: string, photoId: string): string =>
  `gallery/private/albums/${albumId}/originals/${photoId}.jpg`;

export const variantKey = (
  albumId: string,
  photoId: string,
  width: number,
  format: VariantFormat,
): string => `gallery/private/albums/${albumId}/photos/${photoId}/${width}.${format}`;

// Variante publicada. A chave de publicação muda a cada publicação: a URL pode ficar em cache
// por um ano (immutable) sem servir uma versão despublicada.
export const publicVariantKey = (
  albumId: string,
  photoId: string,
  publicationKey: string,
  width: number,
  format: VariantFormat,
): string =>
  `gallery/public/albums/${albumId}/photos/${photoId}/${publicationKey}/${width}.${format}`;

// Todos os objetos privados de uma foto, para a exclusão.
export const privateKeysOf = (
  albumId: string,
  photoId: string,
  variantWidths: readonly number[],
): string[] => [
  uploadKey(photoId),
  originalKey(albumId, photoId),
  ...variantWidths.flatMap((width) =>
    VARIANT_FORMATS.map((format) => variantKey(albumId, photoId, width, format)),
  ),
];

// Todas as variantes de uma publicação, para despublicar ou excluir.
export const publicKeysOf = (
  albumId: string,
  photoId: string,
  publicationKey: string,
  variantWidths: readonly number[],
): string[] =>
  variantWidths.flatMap((width) =>
    VARIANT_FORMATS.map((format) =>
      publicVariantKey(albumId, photoId, publicationKey, width, format),
    ),
  );
