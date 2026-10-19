export type OrganizationError =
  | { type: 'not_found' }
  | { type: 'invalid_fields'; fields: string[] }
  | { type: 'version_conflict' }
  | { type: 'invalid_status_transition' }
  | { type: 'code_taken' }
  | { type: 'organization_inactive' };

export const notFound = { type: 'not_found' } as const;

export const versionConflict = { type: 'version_conflict' } as const;

export const invalidStatusTransition = { type: 'invalid_status_transition' } as const;

export const organizationInactive = { type: 'organization_inactive' } as const;
