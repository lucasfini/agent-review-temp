import { RouteAccessError } from '@/lib/api/route-auth';

const mockRequireAgencyAccess = jest.fn();
const mockRequireAgencyClientAccess = jest.fn();
const mockCanManageAgencyDraft = jest.fn();
const mockListAgencyDeliveryPackages = jest.fn();
const mockCreateAgencyDeliveryPackage = jest.fn();
const mockGetAgencyDeliveryPackage = jest.fn();
const mockUpdateAgencyDeliveryPackage = jest.fn();
const mockExportAgencyDeliveryPackage = jest.fn();
const mockIsDemoUser = jest.fn();

jest.mock('@/lib/authz/agency-permissions', () => {
  const actual = jest.requireActual('@/lib/authz/agency-permissions');
  return {
    ...actual,
    canManageAgencyDraft: (...args: any[]) => mockCanManageAgencyDraft(...args),
    requireAgencyAccess: (...args: any[]) => mockRequireAgencyAccess(...args),
    requireAgencyClientAccess: (...args: any[]) => mockRequireAgencyClientAccess(...args),
  };
});

jest.mock('@/lib/agency-delivery-packages', () => {
  const actual = jest.requireActual('@/lib/agency-delivery-packages');
  return {
    ...actual,
    listAgencyDeliveryPackages: (...args: any[]) => mockListAgencyDeliveryPackages(...args),
    createAgencyDeliveryPackage: (...args: any[]) => mockCreateAgencyDeliveryPackage(...args),
    getAgencyDeliveryPackage: (...args: any[]) => mockGetAgencyDeliveryPackage(...args),
    updateAgencyDeliveryPackage: (...args: any[]) => mockUpdateAgencyDeliveryPackage(...args),
    exportAgencyDeliveryPackage: (...args: any[]) => mockExportAgencyDeliveryPackage(...args),
  };
});

jest.mock('@/lib/demo-mode', () => ({
  isDemoUser: (...args: any[]) => mockIsDemoUser(...args),
}));

jest.mock('@/lib/supabase/server', () => ({
  supabaseAdmin: { from: jest.fn() },
}));

const user = { id: 'user-1', email: 'user@example.com' };
const organization = {
  id: 'agency-org',
  name: 'Internal Agency',
  type: 'internal_agency',
};
const agencyAdmin = {
  role: 'agency_admin',
  status: 'active',
};
const agencyMember = {
  role: 'agency_member',
  status: 'active',
};
const deliveryPackage = {
  id: 'package-1',
  organizationId: 'agency-org',
  clientId: 'client-1',
  title: 'June package',
  status: 'ready',
  deliveryNotes: null,
  metadata: {},
  createdBy: 'user-1',
  deliveredAt: null,
  createdAt: '2026-06-08T00:00:00.000Z',
  updatedAt: '2026-06-08T00:00:00.000Z',
  itemCount: 1,
  items: [],
};

describe('agency delivery package routes', () => {
  beforeEach(() => {
    mockRequireAgencyAccess.mockReset();
    mockRequireAgencyClientAccess.mockReset();
    mockCanManageAgencyDraft.mockReset();
    mockListAgencyDeliveryPackages.mockReset();
    mockCreateAgencyDeliveryPackage.mockReset();
    mockGetAgencyDeliveryPackage.mockReset();
    mockUpdateAgencyDeliveryPackage.mockReset();
    mockExportAgencyDeliveryPackage.mockReset();
    mockIsDemoUser.mockReset();

    mockRequireAgencyAccess.mockResolvedValue({ user, organization, membership: agencyAdmin });
    mockRequireAgencyClientAccess.mockResolvedValue({
      user,
      organization,
      membership: agencyAdmin,
      agencyClient: {
        id: 'client-1',
        organization_id: 'agency-org',
        name: 'Acme',
        status: 'active',
      },
    });
    mockCanManageAgencyDraft.mockReturnValue(true);
    mockListAgencyDeliveryPackages.mockResolvedValue([deliveryPackage]);
    mockCreateAgencyDeliveryPackage.mockResolvedValue(deliveryPackage);
    mockGetAgencyDeliveryPackage.mockResolvedValue(deliveryPackage);
    mockUpdateAgencyDeliveryPackage.mockResolvedValue({ ...deliveryPackage, status: 'delivered' });
    mockExportAgencyDeliveryPackage.mockReturnValue({
      filename: 'june-package.md',
      contentType: 'text/markdown;charset=utf-8',
      body: '# June package',
    });
    mockIsDemoUser.mockReturnValue(false);
  });

  it('lists delivery packages for an internal agency organization', async () => {
    const { GET } = await import('@/app/api/agency/delivery/packages/route');

    const response = await GET(
      new Request('http://localhost/api/agency/delivery/packages?organization_id=agency-org') as any
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.packages).toEqual([deliveryPackage]);
    expect(payload.membership.canManageAgencyDelivery).toBe(true);
    expect(mockListAgencyDeliveryPackages).toHaveBeenCalledWith(
      expect.anything(),
      'agency-org',
      { clientId: null, status: null, limit: 100 }
    );
  });

  it('validates client-scoped package listing against agency client access', async () => {
    const { GET } = await import('@/app/api/agency/delivery/packages/route');

    const response = await GET(
      new Request('http://localhost/api/agency/delivery/packages?organization_id=agency-org&client_id=client-1') as any
    );

    expect(response.status).toBe(200);
    expect(mockRequireAgencyClientAccess).toHaveBeenCalledWith(
      expect.anything(),
      'client-1',
      { requestedOrganizationId: 'agency-org' }
    );
  });

  it('denies SaaS organization members before listing packages', async () => {
    const { GET } = await import('@/app/api/agency/delivery/packages/route');
    mockRequireAgencyAccess.mockRejectedValue(
      new RouteAccessError(403, 'Agency console access requires an internal agency organization')
    );

    const response = await GET(
      new Request('http://localhost/api/agency/delivery/packages?organization_id=saas-org') as any
    );
    const payload = await response.json();

    expect(response.status).toBe(403);
    expect(payload.error).toBe('Agency console access requires an internal agency organization');
    expect(mockListAgencyDeliveryPackages).not.toHaveBeenCalled();
  });

  it('creates delivery packages for internal agency admins', async () => {
    const { POST } = await import('@/app/api/agency/delivery/packages/route');

    const response = await POST(new Request('http://localhost/api/agency/delivery/packages', {
      method: 'POST',
      body: JSON.stringify({
        organization_id: 'agency-org',
        client_id: 'client-1',
        title: 'June package',
        itemIds: ['item-1'],
      }),
    }) as any);
    const payload = await response.json();

    expect(response.status).toBe(201);
    expect(payload.package).toEqual(deliveryPackage);
    expect(mockRequireAgencyClientAccess).toHaveBeenCalledWith(
      expect.anything(),
      'client-1',
      { requestedOrganizationId: 'agency-org' }
    );
    expect(mockCreateAgencyDeliveryPackage).toHaveBeenCalledWith(
      expect.anything(),
      'agency-org',
      'user-1',
      expect.objectContaining({ title: 'June package' })
    );
  });

  it('blocks agency members and demo users from package writes', async () => {
    const { POST } = await import('@/app/api/agency/delivery/packages/route');
    mockRequireAgencyClientAccess.mockResolvedValue({
      user,
      organization,
      membership: agencyMember,
      agencyClient: {
        id: 'client-1',
        organization_id: 'agency-org',
        name: 'Acme',
        status: 'active',
      },
    });
    mockCanManageAgencyDraft.mockReturnValue(false);

    const memberResponse = await POST(new Request('http://localhost/api/agency/delivery/packages', {
      method: 'POST',
      body: JSON.stringify({ organization_id: 'agency-org', client_id: 'client-1', title: 'Package' }),
    }) as any);
    expect(memberResponse.status).toBe(403);

    mockRequireAgencyClientAccess.mockResolvedValue({ user, organization, membership: agencyAdmin });
    mockCanManageAgencyDraft.mockReturnValue(true);
    mockIsDemoUser.mockReturnValue(true);
    const demoResponse = await POST(new Request('http://localhost/api/agency/delivery/packages', {
      method: 'POST',
      body: JSON.stringify({ organization_id: 'agency-org', client_id: 'client-1', title: 'Package' }),
    }) as any);
    expect(demoResponse.status).toBe(403);
  });

  it('marks packages delivered with a server timestamp', async () => {
    const { PATCH } = await import('@/app/api/agency/delivery/packages/[id]/route');

    const response = await PATCH(new Request('http://localhost/api/agency/delivery/packages/package-1', {
      method: 'PATCH',
      body: JSON.stringify({
        organization_id: 'agency-org',
        status: 'delivered',
      }),
    }) as any, { params: Promise.resolve({ id: 'package-1' }) });

    expect(response.status).toBe(200);
    expect(mockUpdateAgencyDeliveryPackage).toHaveBeenCalledWith(
      expect.anything(),
      'agency-org',
      'package-1',
      expect.objectContaining({
        status: 'delivered',
        deliveredAt: expect.any(String),
      })
    );
  });

  it('exports delivery packages without external sending', async () => {
    const { POST } = await import('@/app/api/agency/delivery/packages/[id]/export/route');

    const response = await POST(new Request('http://localhost/api/agency/delivery/packages/package-1/export', {
      method: 'POST',
      body: JSON.stringify({
        organization_id: 'agency-org',
        format: 'markdown',
      }),
    }) as any, { params: Promise.resolve({ id: 'package-1' }) });
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.export.filename).toBe('june-package.md');
    expect(mockExportAgencyDeliveryPackage).toHaveBeenCalledWith(deliveryPackage, 'markdown');
  });
});
