import type { FormRuleError } from '../domain/form.js';

export type FormsError =
  | { type: 'not_found' }
  | { type: 'invalid_fields'; fields: string[] }
  | { type: 'version_conflict' }
  | { type: FormRuleError }
  | { type: 'storage_disabled' }
  | { type: 'upload_missing' }
  | { type: 'upload_too_large' }
  | { type: 'invalid_image' }
  | { type: 'invitation_not_found' }
  | { type: 'already_answered' }
  | { type: 'form_unavailable' }
  | { type: 'invalid_attachment' }
  | { type: 'not_paper_answer' }
  | { type: 'anonymity_locked' }
  | { type: 'no_pending_invitations' }
  | { type: 'no_pending_recipients' }
  | { type: 'form_not_closed' };

export const notFound = { type: 'not_found' } as const;

export const versionConflict = { type: 'version_conflict' } as const;

export const storageDisabled = { type: 'storage_disabled' } as const;

export const uploadMissing = { type: 'upload_missing' } as const;

export const uploadTooLarge = { type: 'upload_too_large' } as const;

export const invalidImage = { type: 'invalid_image' } as const;

export const invalidFields = (fields: string[]) => ({ type: 'invalid_fields', fields }) as const;

export const ruleError = (type: FormRuleError) => ({ type }) as const;
