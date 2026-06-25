import {
  buildOrgScopedLegacyFallbackFilter,
  getDashboardOrganizationContext,
} from '@/lib/api/dashboard-org-context';
import { OrganizationAccessError } from '@/lib/authz/types';

const getActiveOrganizationForUserMock = jest.fn();

jest.mock('@/lib/authz/organization-context', () => ({
  getActiveOrganizationForUser: (...args: any[]) => getActiveOrganizationForUserMock(...args),
}));

describe('dashboard org context helper', () => {
  beforeEach(() => {
    getActiveOrganizationForUserMock.mockReset();
  });

  it('builds org-scoped filter with legacy fallback', () => {
    expect(buildOrgScopedLegacyFallbackFilter('org-1', 'user-1')).toBe(
      'organization_id.eq.org-1,and(organization_id.is.null,user_id.eq.user-1)'
    );
  });

  it('uses requested organization_id when present', async () => {
    getActiveOrganizationForUserMock.mockResolvedValue({
      organization: { id: 'org-requested' },
      membership: { id: 'membership-1' },
    });

    const request = new Request('http://localhost/api/dashboard/projects?organization_id=org-requested');
    const context = await getDashboardOrganizationContext(request as any, 'user-1');

    expect(context.organizationId).toBe('org-requested');
    expect(getActiveOrganizationForUserMock).toHaveBeenCalledWith(
      expect.anything(),
      'user-1',
      'org-requested'
    );
  });

  it('maps organization auth errors to route access errors', async () => {
    getActiveOrganizationForUserMock.mockRejectedValue(
      new OrganizationAccessError(403, 'Forbidden')
    );

    const request = new Request('http://localhost/api/dashboard/projects?organization_id=forbidden-org');
    await expect(getDashboardOrganizationContext(request as any, 'user-1')).rejects.toEqual(
      expect.objectContaining({
        status: 403,
        message: 'Forbidden',
      })
    );
  });
});
