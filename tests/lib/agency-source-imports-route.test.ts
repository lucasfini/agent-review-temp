import { RouteAccessError } from '@/lib/api/route-auth';

const mockRequireAgencyAccess = jest.fn();
const mockRequireAgencyClientAccess = jest.fn();
const mockListAgencySourceImports = jest.fn();
const mockCreateAgencySourceImport = jest.fn();
const mockGetAgencySourceImport = jest.fn();
const mockUpdateAgencySourceImport = jest.fn();
const mockIsDemoUser = jest.fn();

jest.mock('@/lib/authz/agency-permissions', () => {
  const actual = jest.requireActual('@/lib/authz/agency-permissions');
  return {
    ...actual,
    requireAgencyAccess: (...args: any[]) => mockRequireAgencyAccess(...args),
    requireAgencyClientAccess: (...args: any[]) => mockRequireAgencyClientAccess(...args),
  };
});

jest.mock('@/lib/agency-source-imports', () => {
  const actual = jest.requireActual('@/lib/agency-source-imports');
  return {
    ...actual,
    listAgencySourceImports: (...args: any[]) => mockListAgencySourceImports(...args),
    createAgencySourceImport: (...args: any[]) => mockCreateAgencySourceImport(...args),
    getAgencySourceImport: (...args: any[]) => mockGetAgencySourceImport(...args),
    updateAgencySourceImport: (...args: any[]) => mockUpdateAgencySourceImport(...args),
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
const agencyMember = {
  role: 'agency_member',
  status: 'active',
};
const regularMember = {
  role: 'editor',
  status: 'active',
};
const sourceImport = {
  id: 'source-1',
  organizationId: 'agency-org',
  clientId: 'client-1',
  campaignId: null,
  provider: 'manual_note',
  sourceTitle: 'Discovery notes',
  sourceUrl: null,
  rawText: 'Customer language',
  summary: 'Useful positioning context',
  metadata: {},
  importedBy: 'user-1',
  createdAt: '2026-06-06T00:00:00.000Z',
};

describe('agency source import routes', () => {
  beforeEach(() => {
    mockRequireAgencyAccess.mockReset();
    mockRequireAgencyClientAccess.mockReset();
    mockListAgencySourceImports.mockReset();
    mockCreateAgencySourceImport.mockReset();
    mockGetAgencySourceImport.mockReset();
    mockUpdateAgencySourceImport.mockReset();
    mockIsDemoUser.mockReset();

    mockRequireAgencyAccess.mockResolvedValue({
      user,
      organization,
      membership: agencyMember,
    });
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
    mockIsDemoUser.mockReturnValue(false);
  });

  it('lists source imports for an internal agency organization', async () => {
    const { GET } = await import('@/app/api/agency/source-imports/route');
    mockListAgencySourceImports.mockResolvedValue([sourceImport]);

    const response = await GET(
      new Request('http://localhost/api/agency/source-imports?organization_id=agency-org') as any
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.sourceImports).toEqual([sourceImport]);
    expect(payload.membership.canManageAgencySourceImport).toBe(true);
    expect(mockRequireAgencyAccess).toHaveBeenCalledWith(
      expect.anything(),
      { requestedOrganizationId: 'agency-org' }
    );
    expect(mockListAgencySourceImports).toHaveBeenCalledWith(
      expect.anything(),
      'agency-org',
      { clientId: null, provider: null, limit: 100 }
    );
  });

  it('validates client-scoped source import listing against agency client access', async () => {
    const { GET } = await import('@/app/api/agency/source-imports/route');
    mockListAgencySourceImports.mockResolvedValue([sourceImport]);

    const response = await GET(
      new Request('http://localhost/api/agency/source-imports?organization_id=agency-org&client_id=client-1') as any
    );

    expect(response.status).toBe(200);
    expect(mockRequireAgencyClientAccess).toHaveBeenCalledWith(
      expect.anything(),
      'client-1',
      { requestedOrganizationId: 'agency-org' }
    );
    expect(mockListAgencySourceImports).toHaveBeenCalledWith(
      expect.anything(),
      'agency-org',
      { clientId: 'client-1', provider: null, limit: 100 }
    );
  });

  it('denies SaaS organization members before listing source imports', async () => {
    const { GET } = await import('@/app/api/agency/source-imports/route');
    mockRequireAgencyAccess.mockRejectedValue(
      new RouteAccessError(403, 'Agency console access requires an internal agency organization')
    );

    const response = await GET(
      new Request('http://localhost/api/agency/source-imports?organization_id=saas-org') as any
    );
    const payload = await response.json();

    expect(response.status).toBe(403);
    expect(payload.error).toBe('Agency console access requires an internal agency organization');
    expect(mockListAgencySourceImports).not.toHaveBeenCalled();
  });

  it('creates source imports for internal agency operators', async () => {
    const { POST } = await import('@/app/api/agency/source-imports/route');
    mockCreateAgencySourceImport.mockResolvedValue(sourceImport);

    const response = await POST(new Request('http://localhost/api/agency/source-imports', {
      method: 'POST',
      body: JSON.stringify({
        organization_id: 'agency-org',
        client_id: 'client-1',
        provider: 'manual_note',
        sourceTitle: 'Discovery notes',
      }),
    }) as any);
    const payload = await response.json();

    expect(response.status).toBe(201);
    expect(payload.sourceImport).toEqual(sourceImport);
    expect(mockRequireAgencyClientAccess).toHaveBeenCalledWith(
      expect.anything(),
      'client-1',
      { requestedOrganizationId: 'agency-org' }
    );
    expect(mockCreateAgencySourceImport).toHaveBeenCalledWith(
      expect.anything(),
      'agency-org',
      'user-1',
      expect.objectContaining({ sourceTitle: 'Discovery notes' })
    );
  });

  it('blocks regular internal agency members from source import writes', async () => {
    const { POST } = await import('@/app/api/agency/source-imports/route');
    mockRequireAgencyAccess.mockResolvedValue({
      user,
      organization,
      membership: regularMember,
    });

    const response = await POST(new Request('http://localhost/api/agency/source-imports', {
      method: 'POST',
      body: JSON.stringify({
        organization_id: 'agency-org',
        provider: 'manual_note',
        sourceTitle: 'Read only member note',
      }),
    }) as any);
    const payload = await response.json();

    expect(response.status).toBe(403);
    expect(payload.error).toBe('Agency source import management requires internal agency operator access');
    expect(mockCreateAgencySourceImport).not.toHaveBeenCalled();
  });

  it('blocks demo users from source import writes', async () => {
    const { POST } = await import('@/app/api/agency/source-imports/route');
    mockIsDemoUser.mockReturnValue(true);

    const response = await POST(new Request('http://localhost/api/agency/source-imports', {
      method: 'POST',
      body: JSON.stringify({
        organization_id: 'agency-org',
        provider: 'manual_note',
        sourceTitle: 'Demo note',
      }),
    }) as any);
    const payload = await response.json();

    expect(response.status).toBe(403);
    expect(payload.error).toBe('Demo account is read-only');
    expect(mockCreateAgencySourceImport).not.toHaveBeenCalled();
  });

  it('updates source imports after validating next client scope', async () => {
    const { PATCH } = await import('@/app/api/agency/source-imports/[id]/route');
    mockUpdateAgencySourceImport.mockResolvedValue({ ...sourceImport, summary: 'Updated summary' });

    const response = await PATCH(new Request('http://localhost/api/agency/source-imports/source-1', {
      method: 'PATCH',
      body: JSON.stringify({
        organization_id: 'agency-org',
        client_id: 'client-1',
        summary: 'Updated summary',
      }),
    }) as any, { params: Promise.resolve({ id: 'source-1' }) });
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.sourceImport.summary).toBe('Updated summary');
    expect(mockRequireAgencyAccess).toHaveBeenCalledWith(
      expect.anything(),
      { requestedOrganizationId: 'agency-org' }
    );
    expect(mockRequireAgencyClientAccess).toHaveBeenCalledWith(
      expect.anything(),
      'client-1',
      { requestedOrganizationId: 'agency-org' }
    );
    expect(mockUpdateAgencySourceImport).toHaveBeenCalledWith(
      expect.anything(),
      'agency-org',
      'source-1',
      expect.objectContaining({ summary: 'Updated summary' })
    );
  });
});
