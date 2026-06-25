import { OrganizationAccessError } from '@/lib/authz/types';

const mockRequireActiveOrganizationForUser = jest.fn();
const mockRequirePermissionContext = jest.fn();
const mockRequireStudioAssetContext = jest.fn();
const mockListCampaignsForOrganizations = jest.fn();
const mockCreateCampaign = jest.fn();
const mockGetCampaignInOrganizations = jest.fn();
const mockUpdateCampaign = jest.fn();
const mockDeleteCampaign = jest.fn();
const mockListContentLibraryItems = jest.fn();
const mockCreateContentLibraryItem = jest.fn();
const mockGetContentLibraryItem = jest.fn();
const mockUpdateContentLibraryItem = jest.fn();
const mockDeleteContentLibraryItem = jest.fn();
const mockGetCampaign = jest.fn();
const mockIsDemoUser = jest.fn();
const mockCreateResourceVersion = jest.fn();
const mockRecordOrganizationAuditLog = jest.fn();

jest.mock('@/lib/authz/permissions', () => {
  const actual = jest.requireActual('@/lib/authz/permissions');
  return {
    ...actual,
    requireActiveOrganizationForUser: (...args: any[]) => mockRequireActiveOrganizationForUser(...args),
    requirePermissionContext: (...args: any[]) => mockRequirePermissionContext(...args),
  };
});

jest.mock('@/lib/studio-assets', () => ({
  requireStudioAssetContext: (...args: any[]) => mockRequireStudioAssetContext(...args),
}));

jest.mock('@/lib/campaigns-content-library', () => {
  const actual = jest.requireActual('@/lib/campaigns-content-library');
  return {
    ...actual,
    listCampaignsForOrganizations: (...args: any[]) => mockListCampaignsForOrganizations(...args),
    createCampaign: (...args: any[]) => mockCreateCampaign(...args),
    getCampaignInOrganizations: (...args: any[]) => mockGetCampaignInOrganizations(...args),
    updateCampaign: (...args: any[]) => mockUpdateCampaign(...args),
    deleteCampaign: (...args: any[]) => mockDeleteCampaign(...args),
    listContentLibraryItems: (...args: any[]) => mockListContentLibraryItems(...args),
    createContentLibraryItem: (...args: any[]) => mockCreateContentLibraryItem(...args),
    getContentLibraryItem: (...args: any[]) => mockGetContentLibraryItem(...args),
    updateContentLibraryItem: (...args: any[]) => mockUpdateContentLibraryItem(...args),
    deleteContentLibraryItem: (...args: any[]) => mockDeleteContentLibraryItem(...args),
    getCampaign: (...args: any[]) => mockGetCampaign(...args),
  };
});

jest.mock('@/lib/resource-versions', () => ({
  createResourceVersion: (...args: any[]) => mockCreateResourceVersion(...args),
}));

jest.mock('@/lib/organizations/audit', () => ({
  recordOrganizationAuditLog: (...args: any[]) => mockRecordOrganizationAuditLog(...args),
}));

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
const privateOrganization = {
  id: 'personal-1',
  name: 'User Workspace',
  type: 'personal_legacy',
};
const ownerMembership = {
  role: 'owner',
  status: 'active',
};
const memberMembership = {
  role: 'editor',
  status: 'active',
};
const campaign = {
  id: 'campaign-1',
  organizationId: 'org-1',
  clientId: null,
  sharedFromCampaignId: null,
  brandVoiceId: null,
  name: 'Launch campaign',
  status: 'draft',
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
  creatorProfileId: null,
  libraryId: null,
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
    mockRequirePermissionContext.mockReset();
    mockRequireStudioAssetContext.mockReset();
    mockListCampaignsForOrganizations.mockReset();
    mockCreateCampaign.mockReset();
    mockGetCampaignInOrganizations.mockReset();
    mockUpdateCampaign.mockReset();
    mockDeleteCampaign.mockReset();
    mockListContentLibraryItems.mockReset();
    mockCreateContentLibraryItem.mockReset();
    mockGetContentLibraryItem.mockReset();
    mockUpdateContentLibraryItem.mockReset();
    mockDeleteContentLibraryItem.mockReset();
    mockGetCampaign.mockReset();
    mockCreateResourceVersion.mockReset();
    mockRecordOrganizationAuditLog.mockReset();
    mockIsDemoUser.mockReset();

    mockRequireActiveOrganizationForUser.mockResolvedValue({
      user,
      organization,
      membership: ownerMembership,
    });
    mockRequirePermissionContext.mockResolvedValue({
      user,
      organization,
      membership: ownerMembership,
      permissionContext: {
        userId: user.id,
        organizationId: organization.id,
        organizationType: organization.type,
        role: ownerMembership.role,
        isDemo: false,
      },
    });
    mockRequireStudioAssetContext.mockResolvedValue({
      user,
      organization,
      membership: ownerMembership,
      privateOrganization,
      privateOrganizationId: privateOrganization.id,
      activeOrganizationId: organization.id,
      organizationIds: [privateOrganization.id, organization.id],
    });
    mockIsDemoUser.mockReturnValue(false);
    mockGetCampaign.mockResolvedValue(campaign);
    mockCreateResourceVersion.mockResolvedValue({ id: 'version-1' });
    mockRecordOrganizationAuditLog.mockResolvedValue(undefined);
  });

  it('lists campaigns for the requested organization context', async () => {
    const { GET } = await import('@/app/api/campaigns/route');
    mockListCampaignsForOrganizations.mockResolvedValue([campaign]);

    const response = await GET(
      new Request('http://localhost/api/campaigns?organization_id=org-1') as any
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.campaigns).toEqual([
      expect.objectContaining({
        id: 'campaign-1',
        scope: 'organization',
        canEdit: true,
      }),
    ]);
    expect(payload.membership.canManageCampaignLibrary).toBe(true);
    expect(mockRequireStudioAssetContext).toHaveBeenCalledWith(
      expect.anything(),
      { requestedOrganizationId: 'org-1' }
    );
    expect(mockListCampaignsForOrganizations).toHaveBeenCalledWith(expect.anything(), ['personal-1', 'org-1']);
  });

  it('does not list campaigns when organization access is denied', async () => {
    const { GET } = await import('@/app/api/campaigns/route');
    mockRequireStudioAssetContext.mockRejectedValue(new OrganizationAccessError(403, 'Forbidden'));

    const response = await GET(
      new Request('http://localhost/api/campaigns?organization_id=other-org') as any
    );
    const payload = await response.json();

    expect(response.status).toBe(403);
    expect(payload).toEqual({ error: 'Forbidden' });
    expect(mockListCampaignsForOrganizations).not.toHaveBeenCalled();
  });

  it('creates private campaigns for signed-in users', async () => {
    const { POST } = await import('@/app/api/campaigns/route');
    mockCreateCampaign.mockResolvedValue({
      ...campaign,
      organizationId: 'personal-1',
      brandVoiceId: 'voice-1',
    });

    const response = await POST(new Request('http://localhost/api/campaigns', {
      method: 'POST',
      body: JSON.stringify({
        organization_id: 'org-1',
        name: 'Launch campaign',
        brandVoiceId: 'voice-1',
      }),
    }) as any);
    const payload = await response.json();

    expect(response.status).toBe(201);
    expect(payload.campaign.brandVoiceId).toBe('voice-1');
    expect(payload.campaign.scope).toBe('private');
    expect(mockCreateCampaign).toHaveBeenCalledWith(
      expect.anything(),
      'personal-1',
      'user-1',
      expect.objectContaining({ name: 'Launch campaign', brandVoiceId: 'voice-1' })
    );
  });

  it('allows non-admin members to create private campaigns', async () => {
    const { POST } = await import('@/app/api/campaigns/route');
    mockRequireStudioAssetContext.mockResolvedValue({
      user,
      organization,
      membership: memberMembership,
      privateOrganization,
      privateOrganizationId: privateOrganization.id,
      activeOrganizationId: organization.id,
      organizationIds: [privateOrganization.id, organization.id],
    });
    mockCreateCampaign.mockResolvedValue({
      ...campaign,
      id: 'campaign-member',
      organizationId: 'personal-1',
      name: 'Member campaign',
    });

    const response = await POST(new Request('http://localhost/api/campaigns', {
      method: 'POST',
      body: JSON.stringify({ organization_id: 'org-1', name: 'Member campaign' }),
    }) as any);
    const payload = await response.json();

    expect(response.status).toBe(201);
    expect(payload.campaign).toEqual(expect.objectContaining({
      id: 'campaign-member',
      scope: 'private',
    }));
    expect(mockCreateCampaign).toHaveBeenCalledWith(
      expect.anything(),
      'personal-1',
      'user-1',
      expect.objectContaining({ name: 'Member campaign' })
    );
  });

  it('updates an existing campaign by id', async () => {
    const { PATCH } = await import('@/app/api/campaigns/[id]/route');
    mockGetCampaignInOrganizations.mockResolvedValue(campaign);
    mockUpdateCampaign.mockResolvedValue({ ...campaign, status: 'active', brandVoiceId: 'voice-1' });

    const response = await PATCH(new Request('http://localhost/api/campaigns/campaign-1', {
      method: 'PATCH',
      body: JSON.stringify({ organization_id: 'org-1', status: 'active', brandVoiceId: 'voice-1' }),
    }) as any, { params: Promise.resolve({ id: 'campaign-1' }) });
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.campaign.status).toBe('active');
    expect(payload.campaign.brandVoiceId).toBe('voice-1');
    expect(mockUpdateCampaign).toHaveBeenCalledWith(
      expect.anything(),
      'org-1',
      'campaign-1',
      expect.objectContaining({ status: 'active', brandVoiceId: 'voice-1' })
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
    expect(payload.contentItems).toEqual([
      expect.objectContaining({
        ...contentItem,
        canEdit: true,
        canDelete: true,
        canPublish: true,
      }),
    ]);
    expect(mockListContentLibraryItems).toHaveBeenCalledWith(
      expect.anything(),
      'org-1',
      expect.objectContaining({ campaignId: 'campaign-1', status: 'draft' })
    );
  });

  it('blocks demo users from content library writes', async () => {
    const { POST } = await import('@/app/api/content-library/route');
    mockRequirePermissionContext.mockResolvedValue({
      user,
      organization,
      membership: ownerMembership,
      permissionContext: {
        userId: user.id,
        organizationId: organization.id,
        organizationType: organization.type,
        role: ownerMembership.role,
        isDemo: true,
      },
    });

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
    mockGetContentLibraryItem.mockResolvedValue({ ...contentItem, status: 'in_review' });
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

  it('blocks editors from approving drafts when approval is required', async () => {
    const { PATCH } = await import('@/app/api/content-library/[id]/route');
    mockRequirePermissionContext.mockResolvedValue({
      user,
      organization,
      membership: memberMembership,
      permissionContext: {
        userId: user.id,
        organizationId: organization.id,
        organizationType: organization.type,
        role: memberMembership.role,
        isDemo: false,
      },
    });
    mockGetContentLibraryItem.mockResolvedValue({ ...contentItem, status: 'in_review' });
    mockGetCampaign.mockResolvedValue({ ...campaign, approvalRequired: true });

    const response = await PATCH(new Request('http://localhost/api/content-library/item-1', {
      method: 'PATCH',
      body: JSON.stringify({ organization_id: 'org-1', status: 'approved' }),
    }) as any, { params: Promise.resolve({ id: 'item-1' }) });
    const payload = await response.json();

    expect(response.status).toBe(403);
    expect(payload.error).toContain('do not have permission');
    expect(mockUpdateContentLibraryItem).not.toHaveBeenCalled();
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
