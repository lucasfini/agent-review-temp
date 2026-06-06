export interface CurrentOrganization {
  id: string;
  name: string;
  type: 'personal_legacy' | 'saas_customer' | 'internal_agency';
  role?: string;
  status?: string;
  onboarding?: OrganizationOnboardingState;
}

export interface OrganizationOnboardingState {
  completedAt: string | null;
  skippedAt: string | null;
  metadata: Record<string, unknown>;
}

interface CurrentOrganizationResponse {
  organization?: {
    id?: string;
    name?: string;
    type?: 'personal_legacy' | 'saas_customer' | 'internal_agency';
    onboarding?: OrganizationOnboardingState;
  };
  membership?: {
    role?: string;
    status?: string;
  };
  error?: string;
}

export type OrganizationOnboardingProfileInput = {
  website?: string;
  description?: string;
  audience?: string;
  contentGoal?: string;
};

export type UpdateCurrentOrganizationOnboardingInput = {
  name?: string;
  profile?: OrganizationOnboardingProfileInput;
  onboardingCompleted?: boolean;
  onboardingSkipped?: boolean;
};

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
    onboarding: payload.organization.onboarding || undefined,
  };
}

export async function updateCurrentOrganizationOnboarding(
  input: UpdateCurrentOrganizationOnboardingInput,
  accessToken?: string | null,
  organizationId?: string | null
): Promise<CurrentOrganization | null> {
  const response = await fetch(withOrganizationId('/api/organizations/current', organizationId), {
    method: 'PATCH',
    headers: {
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      organization_id: organizationId || undefined,
      ...input,
    }),
    cache: 'no-store',
  });

  const payload = await response.json().catch(() => ({})) as CurrentOrganizationResponse;
  if (!response.ok) {
    throw new Error(payload.error || 'Failed to update current organization');
  }

  if (!payload.organization?.id || !payload.organization?.name || !payload.organization?.type) {
    return null;
  }

  return {
    id: payload.organization.id,
    name: payload.organization.name,
    type: payload.organization.type,
    role: payload.membership?.role,
    status: payload.membership?.status,
    onboarding: payload.organization.onboarding || undefined,
  };
}
