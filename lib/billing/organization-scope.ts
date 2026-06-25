export interface BillingOrganizationScope {
  organizationId: string;
  userId: string;
}

export function buildBillingOrgScopedLegacyFallbackFilter(
  organizationId: string,
  userId: string
): string {
  return `organization_id.eq.${organizationId},and(organization_id.is.null,user_id.eq.${userId})`;
}
