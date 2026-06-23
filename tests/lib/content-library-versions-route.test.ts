const mockRequirePermissionContext = jest.fn();
const mockGetContentLibraryItem = jest.fn();
const mockListResourceVersions = jest.fn();

jest.mock('@/lib/authz/permissions', () => {
  const actual = jest.requireActual('@/lib/authz/permissions');
  return {
    ...actual,
    requirePermissionContext: (...args: any[]) => mockRequirePermissionContext(...args),
  };
});

jest.mock('@/lib/campaigns-content-library', () => {
  const actual = jest.requireActual('@/lib/campaigns-content-library');
  return {
    ...actual,
    getContentLibraryItem: (...args: any[]) => mockGetContentLibraryItem(...args),
  };
});

jest.mock('@/lib/resource-versions', () => ({
  listResourceVersions: (...args: any[]) => mockListResourceVersions(...args),
}));

jest.mock('@/lib/supabase/server', () => ({
  supabaseAdmin: { from: jest.fn() },
}));

const user = { id: 'user-1', email: 'owner@example.com' };
const organization = { id: 'org-1', name: 'Acme Workspace', type: 'saas_customer' };
const contentItem = {
  id: 'item-1',
  organizationId: 'org-1',
  clientId: null,
  creatorProfileId: null,
  libraryId: null,
  campaignId: null,
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
  ownerUserId: 'user-1',
  locked: false,
};

describe('content library version route', () => {
  beforeEach(() => {
    mockRequirePermissionContext.mockReset();
    mockGetContentLibraryItem.mockReset();
    mockListResourceVersions.mockReset();
    mockRequirePermissionContext.mockResolvedValue({
      user,
      organization,
      membership: { role: 'owner', status: 'active' },
      permissionContext: {
        userId: user.id,
        organizationId: organization.id,
        organizationType: organization.type,
        role: 'owner',
        isDemo: false,
      },
    });
    mockGetContentLibraryItem.mockResolvedValue(contentItem);
    mockListResourceVersions.mockResolvedValue([
      {
        id: 'version-1',
        versionNumber: 1,
        changeSummary: 'Created draft',
        changedByName: 'Owner',
        changedByEmail: 'owner@example.com',
        createdAt: '2026-06-22T12:00:00.000Z',
      },
    ]);
  });

  it('returns version history for authorized users', async () => {
    const { GET } = await import('@/app/api/content-library/[id]/versions/route');

    const response = await GET(
      new Request('http://localhost/api/content-library/item-1/versions?organization_id=org-1&limit=5') as any,
      { params: Promise.resolve({ id: 'item-1' }) }
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.versions).toHaveLength(1);
    expect(mockListResourceVersions).toHaveBeenCalledWith(expect.objectContaining({
      organizationId: 'org-1',
      resourceType: 'library_item',
      resourceId: 'item-1',
      limit: 5,
    }));
  });

  it('blocks readers from viewing version history', async () => {
    const { GET } = await import('@/app/api/content-library/[id]/versions/route');
    mockRequirePermissionContext.mockResolvedValue({
      user,
      organization,
      membership: { role: 'reader', status: 'active' },
      permissionContext: {
        userId: user.id,
        organizationId: organization.id,
        organizationType: organization.type,
        role: 'reader',
        isDemo: false,
      },
    });

    const response = await GET(
      new Request('http://localhost/api/content-library/item-1/versions?organization_id=org-1') as any,
      { params: Promise.resolve({ id: 'item-1' }) }
    );
    const payload = await response.json();

    expect(response.status).toBe(403);
    expect(payload.error).toContain('version history');
    expect(mockListResourceVersions).not.toHaveBeenCalled();
  });
});
