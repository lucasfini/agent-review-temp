import {
  fetchCurrentOrganization,
  withOrganizationId,
} from '@/lib/organizations/current-organization';

describe('current organization helpers', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('adds organization_id while preserving existing query params', () => {
    expect(withOrganizationId('/api/dashboard/projects?limit=100', 'org-1')).toBe(
      '/api/dashboard/projects?limit=100&organization_id=org-1'
    );
  });

  it('returns original path when organization id is missing', () => {
    expect(withOrganizationId('/api/dashboard/analytics', null)).toBe('/api/dashboard/analytics');
  });

  it('maps current organization response payload', async () => {
    const fetchMock = jest.spyOn(global, 'fetch' as any).mockResolvedValue({
      ok: true,
      json: async () => ({
        organization: {
          id: 'org-123',
          name: 'Acme Workspace',
          type: 'personal_legacy',
        },
        membership: {
          role: 'owner',
          status: 'active',
        },
      }),
    } as Response);

    const organization = await fetchCurrentOrganization('token-1');

    expect(fetchMock).toHaveBeenCalledWith('/api/organizations/current', {
      headers: { Authorization: 'Bearer token-1' },
      cache: 'no-store',
    });
    expect(organization).toEqual({
      id: 'org-123',
      name: 'Acme Workspace',
      type: 'personal_legacy',
      role: 'owner',
      status: 'active',
    });
  });
});
