import { RouteAccessError } from '@/lib/api/route-auth';

const mockRequireAgencyAccess = jest.fn();
const mockRequireAgencyClientAccess = jest.fn();
const mockListAgencyDrafts = jest.fn();
const mockCreateAgencyDraft = jest.fn();
const mockGetAgencyDraft = jest.fn();
const mockUpdateAgencyDraft = jest.fn();
const mockValidateAgencyDraftReferences = jest.fn();
const mockIsDemoUser = jest.fn();

jest.mock('@/lib/authz/agency-permissions', () => {
  const actual = jest.requireActual('@/lib/authz/agency-permissions');
  return {
    ...actual,
    requireAgencyAccess: (...args: any[]) => mockRequireAgencyAccess(...args),
    requireAgencyClientAccess: (...args: any[]) => mockRequireAgencyClientAccess(...args),
  };
});

jest.mock('@/lib/agency-drafts', () => {
  const actual = jest.requireActual('@/lib/agency-drafts');
  return {
    ...actual,
    listAgencyDrafts: (...args: any[]) => mockListAgencyDrafts(...args),
    createAgencyDraft: (...args: any[]) => mockCreateAgencyDraft(...args),
    getAgencyDraft: (...args: any[]) => mockGetAgencyDraft(...args),
    updateAgencyDraft: (...args: any[]) => mockUpdateAgencyDraft(...args),
    validateAgencyDraftReferences: (...args: any[]) => mockValidateAgencyDraftReferences(...args),
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
const draft = {
  id: 'draft-1',
  organizationId: 'agency-org',
  clientId: 'client-1',
  campaignId: null,
  brandVoiceId: null,
  projectId: null,
  outputId: null,
  title: 'Founder POV draft',
  contentType: 'linkedin_post',
  platform: 'LinkedIn',
  status: 'draft',
  body: 'Draft body',
  excerpt: null,
  sourceLabel: null,
  tags: [],
  metadata: {},
  publishedAt: null,
  createdBy: 'user-1',
  createdAt: '2026-06-06T00:00:00.000Z',
  updatedAt: '2026-06-07T00:00:00.000Z',
};

describe('agency draft routes', () => {
  beforeEach(() => {
    mockRequireAgencyAccess.mockReset();
    mockRequireAgencyClientAccess.mockReset();
    mockListAgencyDrafts.mockReset();
    mockCreateAgencyDraft.mockReset();
    mockGetAgencyDraft.mockReset();
    mockUpdateAgencyDraft.mockReset();
    mockValidateAgencyDraftReferences.mockReset();
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
    mockGetAgencyDraft.mockResolvedValue(draft);
    mockValidateAgencyDraftReferences.mockResolvedValue(undefined);
    mockIsDemoUser.mockReturnValue(false);
  });

  it('lists agency drafts for an internal agency organization', async () => {
    const { GET } = await import('@/app/api/agency/drafts/route');
    mockListAgencyDrafts.mockResolvedValue([draft]);

    const response = await GET(
      new Request('http://localhost/api/agency/drafts?organization_id=agency-org') as any
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.drafts).toEqual([draft]);
    expect(payload.membership.canManageAgencyDraft).toBe(true);
    expect(mockRequireAgencyAccess).toHaveBeenCalledWith(
      expect.anything(),
      { requestedOrganizationId: 'agency-org' }
    );
    expect(mockListAgencyDrafts).toHaveBeenCalledWith(
      expect.anything(),
      'agency-org',
      { clientId: null, status: null, limit: 100 }
    );
  });

  it('validates client-scoped draft listing against agency client access', async () => {
    const { GET } = await import('@/app/api/agency/drafts/route');
    mockListAgencyDrafts.mockResolvedValue([draft]);

    const response = await GET(
      new Request('http://localhost/api/agency/drafts?organization_id=agency-org&client_id=client-1&status=review') as any
    );

    expect(response.status).toBe(200);
    expect(mockRequireAgencyClientAccess).toHaveBeenCalledWith(
      expect.anything(),
      'client-1',
      { requestedOrganizationId: 'agency-org' }
    );
    expect(mockListAgencyDrafts).toHaveBeenCalledWith(
      expect.anything(),
      'agency-org',
      { clientId: 'client-1', status: 'review', limit: 100 }
    );
  });

  it('denies SaaS organization members before listing agency drafts', async () => {
    const { GET } = await import('@/app/api/agency/drafts/route');
    mockRequireAgencyAccess.mockRejectedValue(
      new RouteAccessError(403, 'Agency console access requires an internal agency organization')
    );

    const response = await GET(
      new Request('http://localhost/api/agency/drafts?organization_id=saas-org') as any
    );
    const payload = await response.json();

    expect(response.status).toBe(403);
    expect(payload.error).toBe('Agency console access requires an internal agency organization');
    expect(mockListAgencyDrafts).not.toHaveBeenCalled();
  });

  it('creates agency drafts for internal agency admins', async () => {
    const { POST } = await import('@/app/api/agency/drafts/route');
    mockCreateAgencyDraft.mockResolvedValue(draft);

    const response = await POST(new Request('http://localhost/api/agency/drafts', {
      method: 'POST',
      body: JSON.stringify({
        organization_id: 'agency-org',
        client_id: 'client-1',
        title: 'Founder POV draft',
        contentType: 'linkedin_post',
      }),
    }) as any);
    const payload = await response.json();

    expect(response.status).toBe(201);
    expect(payload.draft).toEqual(draft);
    expect(mockRequireAgencyClientAccess).toHaveBeenCalledWith(
      expect.anything(),
      'client-1',
      { requestedOrganizationId: 'agency-org' }
    );
    expect(mockValidateAgencyDraftReferences).toHaveBeenCalledWith(
      expect.anything(),
      'agency-org',
      expect.objectContaining({ title: 'Founder POV draft' }),
      { clientId: 'client-1' }
    );
    expect(mockCreateAgencyDraft).toHaveBeenCalledWith(
      expect.anything(),
      'agency-org',
      'user-1',
      expect.objectContaining({ title: 'Founder POV draft' })
    );
  });

  it('blocks agency members from agency draft writes', async () => {
    const { POST } = await import('@/app/api/agency/drafts/route');
    mockRequireAgencyAccess.mockResolvedValue({
      user,
      organization,
      membership: agencyMember,
    });

    const response = await POST(new Request('http://localhost/api/agency/drafts', {
      method: 'POST',
      body: JSON.stringify({
        organization_id: 'agency-org',
        title: 'Member draft',
      }),
    }) as any);
    const payload = await response.json();

    expect(response.status).toBe(403);
    expect(payload.error).toBe('Agency draft management requires internal agency admin access');
    expect(mockCreateAgencyDraft).not.toHaveBeenCalled();
  });

  it('blocks demo users from agency draft writes', async () => {
    const { POST } = await import('@/app/api/agency/drafts/route');
    mockIsDemoUser.mockReturnValue(true);

    const response = await POST(new Request('http://localhost/api/agency/drafts', {
      method: 'POST',
      body: JSON.stringify({
        organization_id: 'agency-org',
        title: 'Demo draft',
      }),
    }) as any);
    const payload = await response.json();

    expect(response.status).toBe(403);
    expect(payload.error).toBe('Demo account is read-only');
    expect(mockCreateAgencyDraft).not.toHaveBeenCalled();
  });

  it('rejects agency draft writes with cross-org references', async () => {
    const { POST } = await import('@/app/api/agency/drafts/route');
    mockValidateAgencyDraftReferences.mockRejectedValue(
      new (jest.requireActual('@/lib/campaigns-content-library').CampaignLibraryValidationError)(
        'campaignId must reference a record in this agency organization'
      )
    );

    const response = await POST(new Request('http://localhost/api/agency/drafts', {
      method: 'POST',
      body: JSON.stringify({
        organization_id: 'agency-org',
        title: 'Cross-org draft',
        campaign_id: 'outside-campaign',
      }),
    }) as any);
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.error).toBe('campaignId must reference a record in this agency organization');
    expect(mockCreateAgencyDraft).not.toHaveBeenCalled();
  });

  it('updates agency drafts after validating next client scope', async () => {
    const { PATCH } = await import('@/app/api/agency/drafts/[id]/route');
    mockUpdateAgencyDraft.mockResolvedValue({ ...draft, status: 'published' });

    const response = await PATCH(new Request('http://localhost/api/agency/drafts/draft-1', {
      method: 'PATCH',
      body: JSON.stringify({
        organization_id: 'agency-org',
        client_id: 'client-1',
        status: 'published',
        metadata: { deliveredAt: '2026-06-07T00:00:00.000Z' },
      }),
    }) as any, { params: Promise.resolve({ id: 'draft-1' }) });
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.draft.status).toBe('published');
    expect(mockRequireAgencyAccess).toHaveBeenCalledWith(
      expect.anything(),
      { requestedOrganizationId: 'agency-org' }
    );
    expect(mockRequireAgencyClientAccess).toHaveBeenCalledWith(
      expect.anything(),
      'client-1',
      { requestedOrganizationId: 'agency-org' }
    );
    expect(mockValidateAgencyDraftReferences).toHaveBeenCalledWith(
      expect.anything(),
      'agency-org',
      expect.objectContaining({ status: 'published' }),
      { clientId: 'client-1' }
    );
    expect(mockUpdateAgencyDraft).toHaveBeenCalledWith(
      expect.anything(),
      'agency-org',
      'draft-1',
      expect.objectContaining({ status: 'published' })
    );
  });
});
