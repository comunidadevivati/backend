export type MembersError =
  | { type: 'not_found' }
  | { type: 'invalid_fields'; fields: string[] }
  | { type: 'version_conflict' }
  | { type: 'invalid_status_transition' }
  | { type: 'member_inactive' }
  | { type: 'member_has_open_memberships' }
  | { type: 'congregation_inactive' }
  | { type: 'duplicate_membership' }
  | { type: 'primary_taken' }
  | { type: 'storage_disabled' }
  | { type: 'upload_missing' }
  | { type: 'upload_too_large' }
  | { type: 'invalid_image' };

export const notFound = { type: 'not_found' } as const;

export const versionConflict = { type: 'version_conflict' } as const;

export const invalidStatusTransition = { type: 'invalid_status_transition' } as const;

export const memberInactive = { type: 'member_inactive' } as const;

export const memberHasOpenMemberships = { type: 'member_has_open_memberships' } as const;

export const congregationInactive = { type: 'congregation_inactive' } as const;

export const duplicateMembership = { type: 'duplicate_membership' } as const;

export const primaryTaken = { type: 'primary_taken' } as const;

export const storageDisabled = { type: 'storage_disabled' } as const;

export const uploadMissing = { type: 'upload_missing' } as const;

export const uploadTooLarge = { type: 'upload_too_large' } as const;

export const invalidImage = { type: 'invalid_image' } as const;

export const invalidFields = (fields: string[]) => ({ type: 'invalid_fields', fields }) as const;
