export interface CurrentOrganization {
  id: string;
  name: string;
  type: 'personal_legacy' | 'saas_customer' | 'internal_agency';
  role?: string;
  status?: string;
}

interface CurrentOrganizationResponse {
  organization?: {
    id?: string;
    name?: string;
    type?: 'personal_legacy' | 'saas_customer' | 'internal_agency';
  };
  membership?: {
    role?: string;
    status?: string;
  };
  error?: string;
}

export function withOrganizationId(path: string, organizationId?: string | null): string {
  if (!organizationId) return path;

  const [pathname, query = ''] = path.split('?');
  const params = new URLSearchParams(query);
  params.set('organization_id', organizationId);

  const nextQuery = params.toString();
  return nextQuery ? `${pathname}?${nextQuery}` : pathname;
}

export async function fetchCurrentOrganization(
  accessToken?: string | null
): Promise<CurrentOrganization | null> {
  const response = await fetch('/api/organizations/current', {
    headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
    cache: 'no-store',
  });

  if (!response.ok) {
    return null;
  }

  const payload = await response.json() as CurrentOrganizationResponse;
  if (!payload.organization?.id || !payload.organization?.name || !payload.organization?.type) {
    return null;
  }

  return {
    id: payload.organization.id,
    name: payload.organization.name,
    type: payload.organization.type,
    role: payload.membership?.role,
    status: payload.membership?.status,
  };
}
