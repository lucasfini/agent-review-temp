import { RouteAccessError } from '@/lib/api/route-auth';

const mockRequireAgencyAccess = jest.fn();
const mockRequireAgencyClientAccess = jest.fn();
const mockListAgencyClients = jest.fn();
const mockCreateAgencyClient = jest.fn();
const mockGetAgencyClient = jest.fn();
const mockUpdateAgencyClient = jest.fn();
const mockGetAgencyClientProfile = jest.fn();
const mockUpsertAgencyClientProfile = jest.fn();
const mockIsDemoUser = jest.fn();

jest.mock('@/lib/authz/agency-permissions', () => {
  const actual = jest.requireActual('@/lib/authz/agency-permissions');
  return {
    ...actual,
    requireAgencyAccess: (...args: any[]) => mockRequireAgencyAccess(...args),
    requireAgencyClientAccess: (...args: any[]) => mockRequireAgencyClientAccess(...args),
  };
});

jest.mock('@/lib/agency-clients', () => {
  const actual = jest.requireActual('@/lib/agency-clients');
  return {
    ...actual,
    listAgencyClients: (...args: any[]) => mockListAgencyClients(...args),
    createAgencyClient: (...args: any[]) => mockCreateAgencyClient(...args),
    getAgencyClient: (...args: any[]) => mockGetAgencyClient(...args),
    updateAgencyClient: (...args: any[]) => mockUpdateAgencyClient(...args),
  };
});

jest.mock('@/lib/agency-client-profiles', () => {
  const actual = jest.requireActual('@/lib/agency-client-profiles');
  return {
    ...actual,
    getAgencyClientProfile: (...args: any[]) => mockGetAgencyClientProfile(...args),
    upsertAgencyClientProfile: (...args: any[]) => mockUpsertAgencyClientProfile(...args),
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
const agencyAdmin = {
  role: 'agency_admin',
  status: 'active',
};
const client = {
  id: 'client-1',
  organizationId: 'agency-org',
  name: 'Acme',
  website: null,
  industry: null,
  primaryContactName: null,
  primaryContactEmail: null,
  packageType: null,
  status: 'active',
  notes: null,
  createdBy: 'user-1',
  createdAt: '2026-06-06T00:00:00.000Z',
  updatedAt: '2026-06-06T00:00:00.000Z',
};
const profile = {
  id: 'profile-1',
  clientId: 'client-1',
  businessOverview: 'B2B SaaS platform',
  idealCustomerProfile: null,
  positioning: null,
  offers: ['Content system'],
  competitors: [],
  contentPillars: ['Founder POV'],
  customerPainPoints: [],
  voiceNotes: null,
  customerServiceTone: null,
  metadata: {},
  createdAt: '2026-06-07T00:00:00.000Z',
  updatedAt: '2026-06-07T00:00:00.000Z',
};

describe('agency client routes', () => {
  beforeEach(() => {
    mockRequireAgencyAccess.mockReset();
    mockRequireAgencyClientAccess.mockReset();
    mockListAgencyClients.mockReset();
    mockCreateAgencyClient.mockReset();
    mockGetAgencyClient.mockReset();
    mockUpdateAgencyClient.mockReset();
    mockGetAgencyClientProfile.mockReset();
    mockUpsertAgencyClientProfile.mockReset();
    mockIsDemoUser.mockReset();

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
    mockIsDemoUser.mockReturnValue(false);
    mockGetAgencyClientProfile.mockResolvedValue(profile);
    mockUpsertAgencyClientProfile.mockResolvedValue(profile);
  });

  it('lists agency clients for an internal agency member', async () => {
    const { GET } = await import('@/app/api/agency/clients/route');
    mockRequireAgencyAccess.mockResolvedValue({
      user,
      organization,
      membership: agencyMember,
    });
    mockListAgencyClients.mockResolvedValue([client]);

    const response = await GET(
      new Request('http://localhost/api/agency/clients?organization_id=agency-org') as any
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.clients).toEqual([client]);
    expect(payload.membership.canManageAgencyClient).toBe(false);
    expect(mockRequireAgencyAccess).toHaveBeenCalledWith(
      expect.anything(),
      { requestedOrganizationId: 'agency-org' }
    );
    expect(mockListAgencyClients).toHaveBeenCalledWith(expect.anything(), 'agency-org');
  });

  it('denies SaaS organization members before listing clients', async () => {
    const { GET } = await import('@/app/api/agency/clients/route');
    mockRequireAgencyAccess.mockRejectedValue(
      new RouteAccessError(403, 'Agency console access requires an internal agency organization')
    );

    const response = await GET(
      new Request('http://localhost/api/agency/clients?organization_id=saas-org') as any
    );
    const payload = await response.json();

    expect(response.status).toBe(403);
    expect(payload.error).toBe('Agency console access requires an internal agency organization');
    expect(mockListAgencyClients).not.toHaveBeenCalled();
  });

  it('creates agency clients for internal agency admins', async () => {
    const { POST } = await import('@/app/api/agency/clients/route');
    mockCreateAgencyClient.mockResolvedValue(client);

    const response = await POST(new Request('http://localhost/api/agency/clients', {
      method: 'POST',
      body: JSON.stringify({ organization_id: 'agency-org', name: 'Acme' }),
    }) as any);
    const payload = await response.json();

    expect(response.status).toBe(201);
    expect(payload.client).toEqual(client);
    expect(payload.profile).toBeNull();
    expect(mockRequireAgencyAccess).toHaveBeenCalledWith(
      expect.anything(),
      {
        requestedOrganizationId: 'agency-org',
        requireClientManagement: true,
      }
    );
    expect(mockCreateAgencyClient).toHaveBeenCalledWith(
      expect.anything(),
      'agency-org',
      'user-1',
      expect.objectContaining({ name: 'Acme' })
    );
    expect(mockUpsertAgencyClientProfile).not.toHaveBeenCalled();
  });

  it('creates a client profile when provided during client creation', async () => {
    const { POST } = await import('@/app/api/agency/clients/route');
    mockCreateAgencyClient.mockResolvedValue(client);

    const response = await POST(new Request('http://localhost/api/agency/clients', {
      method: 'POST',
      body: JSON.stringify({
        organization_id: 'agency-org',
        name: 'Acme',
        profile: {
          businessOverview: 'B2B SaaS platform',
          contentPillars: ['Founder POV'],
        },
      }),
    }) as any);
    const payload = await response.json();

    expect(response.status).toBe(201);
    expect(payload.profile).toEqual(profile);
    expect(mockUpsertAgencyClientProfile).toHaveBeenCalledWith(
      expect.anything(),
      'client-1',
      expect.objectContaining({
        businessOverview: 'B2B SaaS platform',
        contentPillars: ['Founder POV'],
      })
    );
  });

  it('blocks demo users from agency client writes', async () => {
    const { POST } = await import('@/app/api/agency/clients/route');
    mockIsDemoUser.mockReturnValue(true);

    const response = await POST(new Request('http://localhost/api/agency/clients', {
      method: 'POST',
      body: JSON.stringify({ organization_id: 'agency-org', name: 'Acme' }),
    }) as any);
    const payload = await response.json();

    expect(response.status).toBe(403);
    expect(payload.error).toBe('Demo account is read-only');
    expect(mockCreateAgencyClient).not.toHaveBeenCalled();
  });

  it('loads an agency client only after scoped client access is validated', async () => {
    const { GET } = await import('@/app/api/agency/clients/[id]/route');
    mockGetAgencyClient.mockResolvedValue(client);

    const response = await GET(
      new Request('http://localhost/api/agency/clients/client-1?organization_id=agency-org') as any,
      { params: Promise.resolve({ id: 'client-1' }) }
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.client).toEqual(client);
    expect(payload.profile).toEqual(profile);
    expect(mockRequireAgencyClientAccess).toHaveBeenCalledWith(
      expect.anything(),
      'client-1',
      { requestedOrganizationId: 'agency-org' }
    );
    expect(mockGetAgencyClient).toHaveBeenCalledWith(expect.anything(), 'agency-org', 'client-1');
    expect(mockGetAgencyClientProfile).toHaveBeenCalledWith(expect.anything(), 'client-1');
  });

  it('updates agency clients for internal agency admins', async () => {
    const { PATCH } = await import('@/app/api/agency/clients/[id]/route');
    mockUpdateAgencyClient.mockResolvedValue({ ...client, status: 'paused' });

    const response = await PATCH(new Request('http://localhost/api/agency/clients/client-1', {
      method: 'PATCH',
      body: JSON.stringify({ organization_id: 'agency-org', status: 'paused' }),
    }) as any, { params: Promise.resolve({ id: 'client-1' }) });
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.client.status).toBe('paused');
    expect(payload.profile).toEqual(profile);
    expect(mockRequireAgencyClientAccess).toHaveBeenCalledWith(
      expect.anything(),
      'client-1',
      {
        requestedOrganizationId: 'agency-org',
        requireClientManagement: true,
      }
    );
    expect(mockUpdateAgencyClient).toHaveBeenCalledWith(
      expect.anything(),
      'agency-org',
      'client-1',
      expect.objectContaining({ status: 'paused' })
    );
    expect(mockGetAgencyClientProfile).toHaveBeenCalledWith(expect.anything(), 'client-1');
  });

  it('updates agency client profiles without requiring basic client fields', async () => {
    const { PATCH } = await import('@/app/api/agency/clients/[id]/route');
    mockGetAgencyClient.mockResolvedValue(client);

    const response = await PATCH(new Request('http://localhost/api/agency/clients/client-1', {
      method: 'PATCH',
      body: JSON.stringify({
        organization_id: 'agency-org',
        profile: {
          businessOverview: 'Updated overview',
          offers: ['Offer one'],
        },
      }),
    }) as any, { params: Promise.resolve({ id: 'client-1' }) });
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.client).toEqual(client);
    expect(payload.profile).toEqual(profile);
    expect(mockUpdateAgencyClient).not.toHaveBeenCalled();
    expect(mockGetAgencyClient).toHaveBeenCalledWith(expect.anything(), 'agency-org', 'client-1');
    expect(mockUpsertAgencyClientProfile).toHaveBeenCalledWith(
      expect.anything(),
      'client-1',
      expect.objectContaining({
        businessOverview: 'Updated overview',
        offers: ['Offer one'],
      })
    );
  });
});
