// Chaves dos objetos privados no bucket de mídia (ADR 0010), relativas à pasta do ambiente. Sempre
// derivadas dos IDs da aplicação, nunca do nome do arquivo enviado. Somente gallery/public/ é servido
// pelo domínio público; estas chaves ficam fora dele.

// Envio bruto do navegador; apagado após o processamento (e por regra de ciclo de vida).
export const uploadKey = (photoId: string): string => `gallery/uploads/${photoId}`;

// Original reduzido (até 4096 px, JPEG, sem metadados).
export const originalKey = (albumId: string, photoId: string): string =>
  `gallery/private/albums/${albumId}/originals/${photoId}.jpg`;

export const variantKey = (
  albumId: string,
  photoId: string,
  width: number,
  format: 'avif' | 'webp',
): string => `gallery/private/albums/${albumId}/photos/${photoId}/${width}.${format}`;

// Todos os objetos privados de uma foto, para a exclusão.
export const privateKeysOf = (
  albumId: string,
  photoId: string,
  variantWidths: readonly number[],
): string[] => [
  uploadKey(photoId),
  originalKey(albumId, photoId),
  ...variantWidths.flatMap((width) => [
    variantKey(albumId, photoId, width, 'avif'),
    variantKey(albumId, photoId, width, 'webp'),
  ]),
];
