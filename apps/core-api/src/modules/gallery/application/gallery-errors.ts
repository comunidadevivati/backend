export type GalleryError =
  | { type: 'not_found' }
  | { type: 'invalid_fields'; fields: string[] }
  | { type: 'version_conflict' }
  | { type: 'album_archived' }
  | { type: 'album_full' }
  | { type: 'upload_missing' }
  | { type: 'upload_too_large' }
  | { type: 'invalid_photo_status' }
  | { type: 'invalid_album_status' }
  | { type: 'album_without_published_photos' }
  | { type: 'cover_not_published' }
  | { type: 'storage_disabled' };

export const notFound = { type: 'not_found' } as const;

export const versionConflict = { type: 'version_conflict' } as const;

export const albumArchived = { type: 'album_archived' } as const;

export const albumFull = { type: 'album_full' } as const;

export const uploadMissing = { type: 'upload_missing' } as const;

export const uploadTooLarge = { type: 'upload_too_large' } as const;

export const invalidPhotoStatus = { type: 'invalid_photo_status' } as const;

export const invalidAlbumStatus = { type: 'invalid_album_status' } as const;

export const albumWithoutPublishedPhotos = { type: 'album_without_published_photos' } as const;

export const coverNotPublished = { type: 'cover_not_published' } as const;

export const storageDisabled = { type: 'storage_disabled' } as const;

export const invalidFields = (fields: string[]) => ({ type: 'invalid_fields', fields }) as const;
