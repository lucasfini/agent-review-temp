import { OrganizationAccessError } from '@/lib/authz/types';

const mockRequireActiveOrganizationForUser = jest.fn();
const mockListCampaigns = jest.fn();
const mockCreateCampaign = jest.fn();
const mockGetCampaign = jest.fn();
const mockUpdateCampaign = jest.fn();
const mockDeleteCampaign = jest.fn();
const mockListContentLibraryItems = jest.fn();
const mockCreateContentLibraryItem = jest.fn();
const mockGetContentLibraryItem = jest.fn();
const mockUpdateContentLibraryItem = jest.fn();
const mockDeleteContentLibraryItem = jest.fn();
const mockIsDemoUser = jest.fn();

jest.mock('@/lib/authz/permissions', () => ({
  requireActiveOrganizationForUser: (...args: any[]) => mockRequireActiveOrganizationForUser(...args),
}));

jest.mock('@/lib/campaigns-content-library', () => {
  const actual = jest.requireActual('@/lib/campaigns-content-library');
  return {
    ...actual,
    listCampaigns: (...args: any[]) => mockListCampaigns(...args),
    createCampaign: (...args: any[]) => mockCreateCampaign(...args),
    getCampaign: (...args: any[]) => mockGetCampaign(...args),
    updateCampaign: (...args: any[]) => mockUpdateCampaign(...args),
    deleteCampaign: (...args: any[]) => mockDeleteCampaign(...args),
    listContentLibraryItems: (...args: any[]) => mockListContentLibraryItems(...args),
    createContentLibraryItem: (...args: any[]) => mockCreateContentLibraryItem(...args),
    getContentLibraryItem: (...args: any[]) => mockGetContentLibraryItem(...args),
    updateContentLibraryItem: (...args: any[]) => mockUpdateContentLibraryItem(...args),
    deleteContentLibraryItem: (...args: any[]) => mockDeleteContentLibraryItem(...args),
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
  id: 'org-1',
  name: 'Acme Workspace',
  type: 'saas_customer',
};
const ownerMembership = {
  role: 'owner',
  status: 'active',
};
const memberMembership = {
  role: 'member',
  status: 'active',
};
const campaign = {
  id: 'campaign-1',
  organizationId: 'org-1',
  clientId: null,
  brandVoiceId: null,
  name: 'Launch campaign',
  status: 'planned',
  objective: null,
  audience: null,
  channels: [],
  startDate: null,
  endDate: null,
  ownerUserId: 'user-1',
  createdBy: 'user-1',
  createdAt: '2026-06-05T00:00:00.000Z',
  updatedAt: '2026-06-05T00:00:00.000Z',
};
const contentItem = {
  id: 'item-1',
  organizationId: 'org-1',
  clientId: null,
  campaignId: 'campaign-1',
  brandVoiceId: null,
  projectId: null,
  outputId: null,
  title: 'Founder POV post',
  contentType: 'linkedin_post',
  platform: 'LinkedIn',
  status: 'draft',
  body: null,
  excerpt: null,
  sourceLabel: null,
  tags: [],
  metadata: {},
  publishedAt: null,
  createdBy: 'user-1',
  createdAt: '2026-06-05T00:00:00.000Z',
  updatedAt: '2026-06-05T00:00:00.000Z',
};

describe('campaign and content library routes', () => {
  beforeEach(() => {
    mockRequireActiveOrganizationForUser.mockReset();
    mockListCampaigns.mockReset();
    mockCreateCampaign.mockReset();
    mockGetCampaign.mockReset();
    mockUpdateCampaign.mockReset();
    mockDeleteCampaign.mockReset();
    mockListContentLibraryItems.mockReset();
    mockCreateContentLibraryItem.mockReset();
    mockGetContentLibraryItem.mockReset();
    mockUpdateContentLibraryItem.mockReset();
    mockDeleteContentLibraryItem.mockReset();
    mockIsDemoUser.mockReset();

    mockRequireActiveOrganizationForUser.mockResolvedValue({
      user,
      organization,
      membership: ownerMembership,
    });
    mockIsDemoUser.mockReturnValue(false);
  });

  it('lists campaigns for the requested organization context', async () => {
    const { GET } = await import('@/app/api/campaigns/route');
    mockListCampaigns.mockResolvedValue([campaign]);

    const response = await GET(
      new Request('http://localhost/api/campaigns?organization_id=org-1') as any
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.campaigns).toEqual([campaign]);
    expect(payload.membership.canManageCampaignLibrary).toBe(true);
    expect(mockRequireActiveOrganizationForUser).toHaveBeenCalledWith(
      expect.anything(),
      { requestedOrganizationId: 'org-1' }
    );
    expect(mockListCampaigns).toHaveBeenCalledWith(expect.anything(), 'org-1');
  });

  it('does not list campaigns when organization access is denied', async () => {
    const { GET } = await import('@/app/api/campaigns/route');
    mockRequireActiveOrganizationForUser.mockRejectedValue(new OrganizationAccessError(403, 'Forbidden'));

    const response = await GET(
      new Request('http://localhost/api/campaigns?organization_id=other-org') as any
    );
    const payload = await response.json();

    expect(response.status).toBe(403);
    expect(payload).toEqual({ error: 'Forbidden' });
    expect(mockListCampaigns).not.toHaveBeenCalled();
  });

  it('creates campaigns for organization owners', async () => {
    const { POST } = await import('@/app/api/campaigns/route');
    mockCreateCampaign.mockResolvedValue(campaign);

    const response = await POST(new Request('http://localhost/api/campaigns', {
      method: 'POST',
      body: JSON.stringify({
        organization_id: 'org-1',
        name: 'Launch campaign',
      }),
    }) as any);
    const payload = await response.json();

    expect(response.status).toBe(201);
    expect(payload.campaign).toEqual(campaign);
    expect(mockCreateCampaign).toHaveBeenCalledWith(
      expect.anything(),
      'org-1',
      'user-1',
      expect.objectContaining({ name: 'Launch campaign' })
    );
  });

  it('blocks non-admin members from creating campaigns', async () => {
    const { POST } = await import('@/app/api/campaigns/route');
    mockRequireActiveOrganizationForUser.mockResolvedValue({
      user,
      organization,
      membership: memberMembership,
    });

    const response = await POST(new Request('http://localhost/api/campaigns', {
      method: 'POST',
      body: JSON.stringify({ organization_id: 'org-1', name: 'Member campaign' }),
    }) as any);
    const payload = await response.json();

    expect(response.status).toBe(403);
    expect(payload.error).toBe('Campaign and library management requires organization owner or admin access');
    expect(mockCreateCampaign).not.toHaveBeenCalled();
  });

  it('updates an existing campaign by id', async () => {
    const { PATCH } = await import('@/app/api/campaigns/[id]/route');
    mockUpdateCampaign.mockResolvedValue({ ...campaign, status: 'active' });

    const response = await PATCH(new Request('http://localhost/api/campaigns/campaign-1', {
      method: 'PATCH',
      body: JSON.stringify({ organization_id: 'org-1', status: 'active' }),
    }) as any, { params: Promise.resolve({ id: 'campaign-1' }) });
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.campaign.status).toBe('active');
    expect(mockUpdateCampaign).toHaveBeenCalledWith(
      expect.anything(),
      'org-1',
      'campaign-1',
      expect.objectContaining({ status: 'active' })
    );
  });

  it('lists content library items with filters', async () => {
    const { GET } = await import('@/app/api/content-library/route');
    mockListContentLibraryItems.mockResolvedValue([contentItem]);

    const response = await GET(
      new Request('http://localhost/api/content-library?organization_id=org-1&campaign_id=campaign-1&status=draft') as any
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.contentItems).toEqual([contentItem]);
    expect(mockListContentLibraryItems).toHaveBeenCalledWith(
      expect.anything(),
      'org-1',
      expect.objectContaining({ campaignId: 'campaign-1', status: 'draft' })
    );
  });

  it('blocks demo users from content library writes', async () => {
    const { POST } = await import('@/app/api/content-library/route');
    mockIsDemoUser.mockReturnValue(true);

    const response = await POST(new Request('http://localhost/api/content-library', {
      method: 'POST',
      body: JSON.stringify({ organization_id: 'org-1', title: 'Demo item' }),
    }) as any);
    const payload = await response.json();

    expect(response.status).toBe(403);
    expect(payload.error).toBe('Demo account is read-only');
    expect(mockCreateContentLibraryItem).not.toHaveBeenCalled();
  });

  it('updates an existing content library item by id', async () => {
    const { PATCH } = await import('@/app/api/content-library/[id]/route');
    mockUpdateContentLibraryItem.mockResolvedValue({ ...contentItem, status: 'approved' });

    const response = await PATCH(new Request('http://localhost/api/content-library/item-1', {
      method: 'PATCH',
      body: JSON.stringify({ organization_id: 'org-1', status: 'approved' }),
    }) as any, { params: Promise.resolve({ id: 'item-1' }) });
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.contentItem.status).toBe('approved');
    expect(mockUpdateContentLibraryItem).toHaveBeenCalledWith(
      expect.anything(),
      'org-1',
      'item-1',
      expect.objectContaining({ status: 'approved' })
    );
  });

  it('returns 404 when deleting a missing content library item', async () => {
    const { DELETE } = await import('@/app/api/content-library/[id]/route');
    mockDeleteContentLibraryItem.mockResolvedValue(false);

    const response = await DELETE(
      new Request('http://localhost/api/content-library/missing?organization_id=org-1') as any,
      { params: Promise.resolve({ id: 'missing' }) }
    );
    const payload = await response.json();

    expect(response.status).toBe(404);
    expect(payload.error).toBe('Content library item not found');
  });
});
