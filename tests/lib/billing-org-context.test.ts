import {
  buildBillingOrgScopedLegacyFallbackFilter,
  getBillingOrganizationContext,
} from '@/lib/api/billing-org-context';
import { OrganizationAccessError } from '@/lib/authz/types';

const getActiveOrganizationForUserMock = jest.fn();

jest.mock('@/lib/authz/organization-context', () => ({
  getActiveOrganizationForUser: (...args: any[]) => getActiveOrganizationForUserMock(...args),
}));

describe('billing org context helper', () => {
  beforeEach(() => {
    getActiveOrganizationForUserMock.mockReset();
  });

  it('builds org-scoped billing filter with legacy fallback', () => {
    expect(buildBillingOrgScopedLegacyFallbackFilter('org-1', 'user-1')).toBe(
      'organization_id.eq.org-1,and(organization_id.is.null,user_id.eq.user-1)'
    );
  });

  it('uses requested organization_id when present', async () => {
    getActiveOrganizationForUserMock.mockResolvedValue({
      organization: { id: 'org-requested' },
      membership: { id: 'membership-1' },
    });

    const request = new Request('http://localhost/api/billing/usage?organization_id=org-requested');
    const context = await getBillingOrganizationContext(request as any, 'user-1');

    expect(context).toEqual({
      organizationId: 'org-requested',
      userId: 'user-1',
    });
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

    const request = new Request('http://localhost/api/billing/usage?organization_id=forbidden-org');
    await expect(getBillingOrganizationContext(request as any, 'user-1')).rejects.toEqual(
      expect.objectContaining({
        status: 403,
        message: 'Forbidden',
      })
    );
  });
});
