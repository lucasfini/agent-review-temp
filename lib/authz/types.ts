export type OrganizationType = 'personal_legacy' | 'saas_customer' | 'internal_agency';
export type OrganizationMemberRole = 'owner' | 'admin' | 'member' | 'agency_admin' | 'agency_member';
export type OrganizationMemberStatus = 'active' | 'invited' | 'removed';

export interface OrganizationRecord {
  id: string;
  name: string;
  slug: string | null;
  type: OrganizationType;
  owner_user_id: string | null;
  onboarding_completed_at?: string | null;
  onboarding_skipped_at?: string | null;
  onboarding_metadata_json?: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

export interface OrganizationMemberRecord {
  id: string;
  organization_id: string;
  user_id: string;
  role: OrganizationMemberRole;
  status: OrganizationMemberStatus;
  invited_by: string | null;
  created_at: string;
  joined_at: string | null;
}

export interface ActiveOrganizationContext {
  organization: OrganizationRecord;
  membership: OrganizationMemberRecord;
}

export class OrganizationAccessError extends Error {
  constructor(
    public readonly status: number,
    message: string
  ) {
    super(message);
    this.name = 'OrganizationAccessError';
  }
}
