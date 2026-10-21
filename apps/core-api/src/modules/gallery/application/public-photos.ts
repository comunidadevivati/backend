import { publicKeysOf } from './media-keys.js';
import type {
  AlbumRepository,
  PhotoRepository,
  PrivateMediaStorage,
  PublicMediaCache,
} from './ports.js';

// Efeitos de uma foto sair do site, comuns a despublicar e a excluir: apaga as variantes públicas,
// tira-as do cache da CDN e passa a capa do álbum para a próxima foto publicada.
export class PublicPhotoRemoval {
  constructor(
    private readonly albums: AlbumRepository,
    private readonly photos: PhotoRepository,
    private readonly storage: PrivateMediaStorage,
    private readonly cache: PublicMediaCache,
  ) {}

  async removeObjects(
    albumId: string,
    photoId: string,
    publicationKey: string,
    variantWidths: readonly number[],
  ): Promise<void> {
    const keys = publicKeysOf(albumId, photoId, publicationKey, variantWidths);

    await this.storage.delete(keys);

    await this.cache.purge(keys);
  }

  // A foto já não é publicada (ou não existe) quando isto é chamado.
  async replaceCover(albumId: string, photoId: string): Promise<void> {
    const album = await this.albums.findById(albumId);

    if (!album || album.coverPhotoId !== photoId) {
      return;
    }

    album.replaceCover(photoId, await this.photos.findFirstPublishedId(albumId));

    // Conflito de versão: outra operação alterou o álbum ao mesmo tempo; tenta uma vez mais.
    if ((await this.albums.update(album)) === null) {
      const fresh = await this.albums.findById(albumId);

      if (fresh?.replaceCover(photoId, await this.photos.findFirstPublishedId(albumId))) {
        await this.albums.update(fresh);
      }
    }
  }
}
