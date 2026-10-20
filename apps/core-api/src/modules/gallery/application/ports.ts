import type { Album, AlbumSnapshot, AlbumStatus } from '../domain/album.js';
import type { Photo, PhotoSnapshot, PhotoStatus } from '../domain/photo.js';

// As Ports são classes abstratas para servirem também de token de injeção na composição.

// Álbum como exposto no painel: inclui a quantidade de fotos prontas.
export interface AlbumView extends AlbumSnapshot {
  photoCount: number;
}

export interface AlbumListQuery {
  status: AlbumStatus | null;
  // Cursor: ID (UUIDv7, ordenável por criação) do último item da página anterior.
  after: string | null;
  limit: number;
}

export abstract class AlbumRepository {
  abstract findById(id: string): Promise<Album | null>;

  abstract findView(id: string): Promise<AlbumView | null>;

  // Mais recentes primeiro (data do evento e, no empate, criação).
  abstract list(query: AlbumListQuery): Promise<AlbumView[]>;

  // Restrição do banco: slug único ("slug_taken").
  abstract insert(album: Album): Promise<'inserted' | 'slug_taken'>;

  // Controle otimista: grava somente se a versão persistida ainda for a do Aggregate carregado.
  abstract update(album: Album): Promise<number | null>;
}

export interface PhotoListQuery {
  albumId: string;
  after: string | null;
  limit: number;
}

export abstract class PhotoRepository {
  abstract findById(id: string): Promise<Photo | null>;

  // Fotos já enviadas (exclui PENDING_UPLOAD), na ordem de envio.
  abstract listByAlbum(query: PhotoListQuery): Promise<PhotoSnapshot[]>;

  // Fotos já enviadas ou aguardando envio (para o limite por álbum).
  abstract countByAlbum(albumId: string): Promise<number>;

  abstract listByStatus(status: PhotoStatus): Promise<PhotoSnapshot[]>;

  abstract insertMany(photos: readonly Photo[]): Promise<void>;

  abstract update(photo: Photo): Promise<number | null>;

  abstract delete(id: string): Promise<void>;

  // Pedidos de envio abandonados (o objeto bruto expira por regra de ciclo de vida do bucket).
  abstract deletePendingCreatedBefore(albumId: string, before: Date): Promise<void>;
}

// Área privada do bucket de mídia (R2 ou emulador S3). Nunca expõe URL pública permanente.
export abstract class PrivateMediaStorage {
  // false quando MEDIA_STORAGE=disabled.
  abstract readonly enabled: boolean;

  // URL para o navegador enviar o arquivo direto ao bucket, com o Content-Type assinado.
  abstract presignUpload(
    key: string,
    contentType: string,
    expiresInSeconds: number,
  ): Promise<string>;

  // URL de leitura de validade curta (miniaturas do painel).
  abstract presignDownload(key: string, expiresInSeconds: number): Promise<string>;

  abstract size(key: string): Promise<number | null>;

  abstract read(key: string): Promise<Uint8Array | null>;

  abstract write(key: string, body: Uint8Array, contentType: string): Promise<void>;

  abstract delete(keys: readonly string[]): Promise<void>;
}

export interface ImageVariant {
  width: number;
  format: 'avif' | 'webp';
  body: Uint8Array;
}

export interface ProcessedImage {
  width: number;
  height: number;
  placeholder: string;
  // Original reduzido (JPEG, sem metadados) guardado na área privada.
  original: Uint8Array;
  variants: ImageVariant[];
}

export abstract class ImageProcessor {
  // null quando o conteúdo não é uma imagem aceita (independe do tipo declarado).
  abstract process(input: Uint8Array): Promise<ProcessedImage | null>;
}

// Fila de processamento: as fotos são processadas uma por vez, fora da requisição.
export abstract class PhotoProcessingQueue {
  abstract enqueue(photoId: string): void;
}

export abstract class IdGenerator {
  abstract next(): string;
}

export abstract class Clock {
  // Data civil atual (AAAA-MM-DD) no fuso da comunidade.
  abstract today(): string;

  abstract now(): Date;
}
