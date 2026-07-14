import type { CurrentOrganizationType } from '@/lib/organizations/current-organization';

export type BillingWorkspaceType = CurrentOrganizationType | string | null | undefined;

export function isTeamWorkspacePlanSlug(planSlug?: string | null): boolean {
  return planSlug === 'pro' || planSlug === 'teams';
}

export function isPersonalWorkspacePlanSlug(planSlug?: string | null): boolean {
  return planSlug === 'free' || planSlug === 'standard';
}

export function isPersonalWorkspaceType(type?: BillingWorkspaceType): boolean {
  return type === 'personal_legacy';
}

export function isTeamWorkspaceType(type?: BillingWorkspaceType): boolean {
  return type === 'saas_customer';
}

export function getWorkspacePlanRestriction(params: {
  planSlug?: string | null;
  organizationType?: BillingWorkspaceType;
}): string | null {
  if (isTeamWorkspaceType(params.organizationType) && isPersonalWorkspacePlanSlug(params.planSlug)) {
    return 'Team workspaces require Pro or Teams. Choose a team plan to continue.';
  }

  return null;
}
