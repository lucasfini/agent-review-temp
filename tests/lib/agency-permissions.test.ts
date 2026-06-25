import { RouteAccessError } from '@/lib/api/route-auth';

const mockRequireActiveOrganizationForUser = jest.fn();
const mockFrom = jest.fn();

jest.mock('@/lib/authz/permissions', () => ({
  requireActiveOrganizationForUser: (...args: any[]) => mockRequireActiveOrganizationForUser(...args),
}));

jest.mock('@/lib/supabase/server', () => ({
  supabaseAdmin: {
    from: (...args: any[]) => mockFrom(...args),
  },
}));

import {
  canAccessAgencyConsole,
  canManageAgencyClient,
  canManageAgencyDraft,
  canManageAgencyProductionTask,
  canManageAgencySourceImport,
  isInternalAgencyOrganization,
  requireAgencyAccess,
  requireAgencyClientAccess,
} from '@/lib/authz/agency-permissions';

const user = { id: 'user-1', email: 'user@example.com' };
const internalAgencyOrganization = {
  id: 'agency-org',
  name: 'Internal Agency',
  type: 'internal_agency',
};
const saasOrganization = {
  id: 'saas-org',
  name: 'SaaS Customer',
  type: 'saas_customer',
};

describe('agency permission helpers', () => {
  beforeEach(() => {
    mockRequireActiveOrganizationForUser.mockReset();
    mockFrom.mockReset();
  });

  it('recognizes only internal agency organizations', () => {
    expect(isInternalAgencyOrganization('internal_agency')).toBe(true);
    expect(isInternalAgencyOrganization({ type: 'internal_agency' } as any)).toBe(true);
    expect(isInternalAgencyOrganization('saas_customer')).toBe(false);
  });

  it('allows active internal agency operators to access the agency console', () => {
    expect(canAccessAgencyConsole('owner', 'internal_agency')).toBe(true);
    expect(canAccessAgencyConsole('editor', 'internal_agency')).toBe(true);
    expect(canAccessAgencyConsole('agency_admin', 'internal_agency')).toBe(true);
    expect(canAccessAgencyConsole('agency_member', 'internal_agency')).toBe(true);
    expect(canAccessAgencyConsole('owner', 'saas_customer')).toBe(false);
  });

  it('limits agency client management to internal agency admins and owners', () => {
    expect(canManageAgencyClient('owner', 'internal_agency')).toBe(true);
    expect(canManageAgencyClient('admin', 'internal_agency')).toBe(true);
    expect(canManageAgencyClient('agency_admin', 'internal_agency')).toBe(true);
    expect(canManageAgencyClient('agency_member', 'internal_agency')).toBe(false);
    expect(canManageAgencyClient('admin', 'saas_customer')).toBe(false);
  });

  it('allows internal agency operators to manage source imports', () => {
    expect(canManageAgencySourceImport('owner', 'internal_agency')).toBe(true);
    expect(canManageAgencySourceImport('admin', 'internal_agency')).toBe(true);
    expect(canManageAgencySourceImport('agency_admin', 'internal_agency')).toBe(true);
    expect(canManageAgencySourceImport('agency_member', 'internal_agency')).toBe(true);
    expect(canManageAgencySourceImport('editor', 'internal_agency')).toBe(false);
    expect(canManageAgencySourceImport('agency_member', 'saas_customer')).toBe(false);
  });

  it('allows internal agency operators to manage production tasks', () => {
    expect(canManageAgencyProductionTask('owner', 'internal_agency')).toBe(true);
    expect(canManageAgencyProductionTask('admin', 'internal_agency')).toBe(true);
    expect(canManageAgencyProductionTask('agency_admin', 'internal_agency')).toBe(true);
    expect(canManageAgencyProductionTask('agency_member', 'internal_agency')).toBe(true);
    expect(canManageAgencyProductionTask('editor', 'internal_agency')).toBe(false);
    expect(canManageAgencyProductionTask('agency_member', 'saas_customer')).toBe(false);
  });

  it('limits agency draft management to internal agency admins and owners', () => {
    expect(canManageAgencyDraft('owner', 'internal_agency')).toBe(true);
    expect(canManageAgencyDraft('admin', 'internal_agency')).toBe(true);
    expect(canManageAgencyDraft('agency_admin', 'internal_agency')).toBe(true);
    expect(canManageAgencyDraft('agency_member', 'internal_agency')).toBe(false);
    expect(canManageAgencyDraft('editor', 'internal_agency')).toBe(false);
    expect(canManageAgencyDraft('agency_admin', 'saas_customer')).toBe(false);
  });

  it('denies SaaS organization members agency access', async () => {
    mockRequireActiveOrganizationForUser.mockResolvedValue({
      user,
      organization: saasOrganization,
      membership: { role: 'owner', status: 'active' },
    });

    await expect(requireAgencyAccess(new Request('http://localhost/api/agency/clients') as any))
      .rejects
      .toMatchObject({
        status: 403,
        message: 'Agency console access requires an internal agency organization',
      });
  });

  it('allows internal agency members agency access', async () => {
    mockRequireActiveOrganizationForUser.mockResolvedValue({
      user,
      organization: internalAgencyOrganization,
      membership: { role: 'agency_member', status: 'active' },
    });

    const context = await requireAgencyAccess(new Request('http://localhost/api/agency/clients') as any);

    expect(context.organization.id).toBe('agency-org');
    expect(context.membership.role).toBe('agency_member');
  });

  it('scopes agency client access to the active internal agency organization', async () => {
    mockRequireActiveOrganizationForUser.mockResolvedValue({
      user,
      organization: internalAgencyOrganization,
      membership: { role: 'agency_member', status: 'active' },
    });

    const maybeSingle = jest.fn().mockResolvedValue({
      data: {
        id: 'client-1',
        organization_id: 'agency-org',
        name: 'Acme',
        status: 'active',
      },
      error: null,
    });
    const eqClient = jest.fn(() => ({ maybeSingle }));
    const eqOrg = jest.fn(() => ({ eq: eqClient }));
    const select = jest.fn(() => ({ eq: eqOrg }));
    mockFrom.mockReturnValue({ select });

    const context = await requireAgencyClientAccess(
      new Request('http://localhost/api/agency/clients/client-1') as any,
      'client-1',
      { requestedOrganizationId: 'agency-org' }
    );

    expect(context.agencyClient.id).toBe('client-1');
    expect(mockRequireActiveOrganizationForUser).toHaveBeenCalledWith(
      expect.anything(),
      { requestedOrganizationId: 'agency-org' }
    );
    expect(eqOrg).toHaveBeenCalledWith('organization_id', 'agency-org');
    expect(eqClient).toHaveBeenCalledWith('id', 'client-1');
  });

  it('returns a 404 when the client is outside the active agency org', async () => {
    mockRequireActiveOrganizationForUser.mockResolvedValue({
      user,
      organization: internalAgencyOrganization,
      membership: { role: 'agency_member', status: 'active' },
    });

    const maybeSingle = jest.fn().mockResolvedValue({ data: null, error: null });
    const eqClient = jest.fn(() => ({ maybeSingle }));
    const eqOrg = jest.fn(() => ({ eq: eqClient }));
    const select = jest.fn(() => ({ eq: eqOrg }));
    mockFrom.mockReturnValue({ select });

    await expect(requireAgencyClientAccess(
      new Request('http://localhost/api/agency/clients/client-2') as any,
      'client-2',
      { requestedOrganizationId: 'agency-org' }
    )).rejects.toBeInstanceOf(RouteAccessError);

    await expect(requireAgencyClientAccess(
      new Request('http://localhost/api/agency/clients/client-2') as any,
      'client-2',
      { requestedOrganizationId: 'agency-org' }
    )).rejects.toMatchObject({
      status: 404,
      message: 'Agency client not found',
    });
  });
});
