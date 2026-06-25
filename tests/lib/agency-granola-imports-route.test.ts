import { RouteAccessError } from '@/lib/api/route-auth';

const mockRequireAgencyAccess = jest.fn();
const mockRequireAgencyClientAccess = jest.fn();
const mockCanManageAgencyClient = jest.fn();
const mockCanManageAgencySourceImport = jest.fn();
const mockListAgencySourceImports = jest.fn();
const mockCreateAgencySourceImport = jest.fn();
const mockGetAgencyClientIntegration = jest.fn();
const mockSetAgencyClientIntegration = jest.fn();
const mockIsDemoUser = jest.fn();
const mockUploadRateLimit = jest.fn();

jest.mock('@/lib/authz/agency-permissions', () => {
  const actual = jest.requireActual('@/lib/authz/agency-permissions');
  return {
    ...actual,
    canManageAgencyClient: (...args: any[]) => mockCanManageAgencyClient(...args),
    canManageAgencySourceImport: (...args: any[]) => mockCanManageAgencySourceImport(...args),
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
  };
});

jest.mock('@/lib/agency-client-integrations', () => {
  const actual = jest.requireActual('@/lib/agency-client-integrations');
  return {
    ...actual,
    getAgencyClientIntegration: (...args: any[]) => mockGetAgencyClientIntegration(...args),
    setAgencyClientIntegration: (...args: any[]) => mockSetAgencyClientIntegration(...args),
  };
});

jest.mock('@/lib/demo-mode', () => ({
  isDemoUser: (...args: any[]) => mockIsDemoUser(...args),
}));

jest.mock('@/lib/rate-limit', () => ({
  uploadRatelimit: {
    limit: (...args: any[]) => mockUploadRateLimit(...args),
  },
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
const sourceImport = {
  id: 'source-1',
  organizationId: 'agency-org',
  clientId: 'client-1',
  campaignId: null,
  provider: 'granola',
  sourceTitle: 'Granola notes',
  sourceUrl: null,
  rawText: 'Meeting notes',
  summary: 'Meeting summary',
  metadata: { capturedVia: 'agency_granola_manual_import' },
  importedBy: 'user-1',
  createdAt: '2026-06-07T00:00:00.000Z',
};
const integration = {
  id: 'integration-1',
  clientId: 'client-1',
  provider: 'granola',
  status: 'connected',
  metadata: { mode: 'manual_import' },
  connectedAt: '2026-06-07T00:00:00.000Z',
  lastSyncAt: '2026-06-07T00:00:00.000Z',
  createdAt: '2026-06-07T00:00:00.000Z',
  updatedAt: '2026-06-07T00:00:00.000Z',
};

describe('agency Granola manual import routes', () => {
  beforeEach(() => {
    mockRequireAgencyAccess.mockReset();
    mockRequireAgencyClientAccess.mockReset();
    mockCanManageAgencyClient.mockReset();
    mockCanManageAgencySourceImport.mockReset();
    mockListAgencySourceImports.mockReset();
    mockCreateAgencySourceImport.mockReset();
    mockGetAgencyClientIntegration.mockReset();
    mockSetAgencyClientIntegration.mockReset();
    mockIsDemoUser.mockReset();
    mockUploadRateLimit.mockReset();

    mockRequireAgencyAccess.mockResolvedValue({
      user,
      organization,
      membership: agencyAdmin,
    });
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
    mockCanManageAgencyClient.mockReturnValue(true);
    mockCanManageAgencySourceImport.mockReturnValue(true);
    mockGetAgencyClientIntegration.mockResolvedValue(integration);
    mockSetAgencyClientIntegration.mockResolvedValue(integration);
    mockIsDemoUser.mockReturnValue(false);
    mockUploadRateLimit.mockResolvedValue({ success: true, limit: 30, remaining: 29, reset: Date.now() + 60000 });
  });

  it('lists Granola imports for an internal agency organization', async () => {
    const { GET } = await import('@/app/api/agency/granola/imports/route');
    mockListAgencySourceImports.mockResolvedValue([sourceImport]);

    const response = await GET(
      new Request('http://localhost/api/agency/granola/imports?organization_id=agency-org') as any
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.imports).toEqual([sourceImport]);
    expect(mockRequireAgencyAccess).toHaveBeenCalledWith(
      expect.anything(),
      { requestedOrganizationId: 'agency-org' }
    );
    expect(mockListAgencySourceImports).toHaveBeenCalledWith(
      expect.anything(),
      'agency-org',
      { clientId: null, provider: 'granola', limit: 100 }
    );
  });

  it('validates client-scoped Granola listing against agency client access', async () => {
    const { GET } = await import('@/app/api/agency/granola/imports/route');
    mockListAgencySourceImports.mockResolvedValue([sourceImport]);

    const response = await GET(
      new Request('http://localhost/api/agency/granola/imports?organization_id=agency-org&client_id=client-1') as any
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.integration).toEqual(integration);
    expect(mockRequireAgencyClientAccess).toHaveBeenCalledWith(
      expect.anything(),
      'client-1',
      { requestedOrganizationId: 'agency-org' }
    );
    expect(mockGetAgencyClientIntegration).toHaveBeenCalledWith(
      expect.anything(),
      'client-1',
      'granola'
    );
  });

  it('denies SaaS organization members before listing Granola imports', async () => {
    const { GET } = await import('@/app/api/agency/granola/imports/route');
    mockRequireAgencyAccess.mockRejectedValue(
      new RouteAccessError(403, 'Agency console access requires an internal agency organization')
    );

    const response = await GET(
      new Request('http://localhost/api/agency/granola/imports?organization_id=saas-org') as any
    );
    const payload = await response.json();

    expect(response.status).toBe(403);
    expect(payload.error).toBe('Agency console access requires an internal agency organization');
    expect(mockListAgencySourceImports).not.toHaveBeenCalled();
  });

  it('requires a client for Granola imports', async () => {
    const { POST } = await import('@/app/api/agency/granola/imports/route');

    const response = await POST(new Request('http://localhost/api/agency/granola/imports', {
      method: 'POST',
      body: JSON.stringify({
        organization_id: 'agency-org',
        sourceTitle: 'Granola notes',
      }),
    }) as any);
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.error).toBe('client_id is required for Granola imports');
    expect(mockCreateAgencySourceImport).not.toHaveBeenCalled();
  });

  it('creates Granola source imports and integration tracking for agency admins', async () => {
    const { POST } = await import('@/app/api/agency/granola/imports/route');
    mockCreateAgencySourceImport.mockResolvedValue(sourceImport);

    const response = await POST(new Request('http://localhost/api/agency/granola/imports', {
      method: 'POST',
      body: JSON.stringify({
        organization_id: 'agency-org',
        client_id: 'client-1',
        sourceTitle: 'Granola notes',
        rawText: 'Action Items:\n- Parsed action',
        summary: 'Manual summary',
        meetingDate: '2026-06-07',
        meetingType: 'Customer interview',
        participants: 'Lucas, Client',
        decisions: 'Keep workflow manual',
        actionItems: 'Send recap\nCreate delivery plan',
        customerPainPoints: 'Hard to reuse meeting notes',
        notableQuotes: '"We need this weekly"',
        followUpOpportunities: 'Monthly review bundle',
      }),
    }) as any);
    const payload = await response.json();

    expect(response.status).toBe(201);
    expect(payload.sourceImport).toEqual(sourceImport);
    expect(payload.integration).toEqual(integration);
    expect(mockCreateAgencySourceImport).toHaveBeenCalledWith(
      expect.anything(),
      'agency-org',
      'user-1',
      expect.objectContaining({
        provider: 'granola',
        client_id: 'client-1',
        sourceTitle: 'Granola notes',
        rawText: 'Action Items:\n- Parsed action',
        summary: 'Manual summary',
        metadata: expect.objectContaining({
          capturedVia: 'agency_granola_manual_import',
          meetingDate: '2026-06-07',
          meetingType: 'Customer interview',
          participants: ['Lucas', 'Client'],
          decisions: ['Keep workflow manual'],
          actionItems: ['Send recap', 'Create delivery plan'],
          customerPainPoints: ['Hard to reuse meeting notes'],
          notableQuotes: ['We need this weekly'],
          followUpOpportunities: ['Monthly review bundle'],
          parserWarnings: [],
        }),
      })
    );
    expect(mockSetAgencyClientIntegration).toHaveBeenCalledWith(
      expect.anything(),
      'client-1',
      expect.objectContaining({
        provider: 'granola',
        status: 'connected',
      })
    );
  });

  it('lets agency members import without mutating integration tracking', async () => {
    const { POST } = await import('@/app/api/agency/granola/imports/route');
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
    mockCanManageAgencyClient.mockReturnValue(false);
    mockCanManageAgencySourceImport.mockReturnValue(true);
    mockCreateAgencySourceImport.mockResolvedValue(sourceImport);

    const response = await POST(new Request('http://localhost/api/agency/granola/imports', {
      method: 'POST',
      body: JSON.stringify({
        organization_id: 'agency-org',
        client_id: 'client-1',
        sourceTitle: 'Granola notes',
      }),
    }) as any);

    expect(response.status).toBe(201);
    expect(mockSetAgencyClientIntegration).not.toHaveBeenCalled();
    expect(mockGetAgencyClientIntegration).toHaveBeenCalledWith(
      expect.anything(),
      'client-1',
      'granola'
    );
  });

  it('blocks demo users from Granola imports', async () => {
    const { POST } = await import('@/app/api/agency/granola/imports/route');
    mockIsDemoUser.mockReturnValue(true);

    const response = await POST(new Request('http://localhost/api/agency/granola/imports', {
      method: 'POST',
      body: JSON.stringify({
        organization_id: 'agency-org',
        client_id: 'client-1',
        sourceTitle: 'Demo import',
      }),
    }) as any);
    const payload = await response.json();

    expect(response.status).toBe(403);
    expect(payload.error).toBe('Demo account is read-only');
    expect(mockCreateAgencySourceImport).not.toHaveBeenCalled();
  });
});
