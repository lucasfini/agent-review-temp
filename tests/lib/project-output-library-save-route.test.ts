const mockRequireProjectOwner = jest.fn();
const mockRequireStudioAssetContext = jest.fn();
const mockIsDemoUser = jest.fn();
const mockCan = jest.fn();
const mockCreateContentLibraryItem = jest.fn();
const mockUpdateContentLibraryItem = jest.fn();
const mockDecorateContentLibraryItemAccess = jest.fn();
const mockRecordOrganizationAuditLog = jest.fn();
const mockCreateResourceVersion = jest.fn();

let mockOutputResult: any = { data: null, error: null };
let mockExistingRowsResult: any = { data: [], error: null };

function createQuery(table: string) {
  const query: any = {
    select: jest.fn(() => query),
    eq: jest.fn(() => query),
    is: jest.fn(() => query),
    order: jest.fn(() => query),
    maybeSingle: jest.fn(async () => {
      if (table === 'outputs') return mockOutputResult;
      return { data: null, error: null };
    }),
    limit: jest.fn(async () => {
      if (table === 'content_library_items') return mockExistingRowsResult;
      return { data: [], error: null };
    }),
  };
  return query;
}

const mockSupabaseAdmin = {
  from: jest.fn((table: string) => createQuery(table)),
};

jest.mock('@/lib/api/route-auth', () => ({
  RouteAccessError: class RouteAccessError extends Error {
    status: number;
    constructor(status: number, message: string) {
      super(message);
      this.status = status;
    }
  },
  requireProjectOwner: (...args: any[]) => mockRequireProjectOwner(...args),
}));

jest.mock('@/lib/studio-assets', () => ({
  requireStudioAssetContext: (...args: any[]) => mockRequireStudioAssetContext(...args),
}));

jest.mock('@/lib/demo-mode', () => ({
  isDemoUser: (...args: any[]) => mockIsDemoUser(...args),
}));

jest.mock('@/lib/authz/permissions', () => ({
  can: (...args: any[]) => mockCan(...args),
}));

jest.mock('@/lib/authz/types', () => ({
  OrganizationAccessError: class OrganizationAccessError extends Error {
    status = 403;
  },
}));

jest.mock('@/lib/campaigns-content-library', () => ({
  CampaignLibraryValidationError: class CampaignLibraryValidationError extends Error {},
  createContentLibraryItem: (...args: any[]) => mockCreateContentLibraryItem(...args),
  updateContentLibraryItem: (...args: any[]) => mockUpdateContentLibraryItem(...args),
  decorateContentLibraryItemAccess: (...args: any[]) => mockDecorateContentLibraryItemAccess(...args),
  mapContentLibraryItemRow: (row: any) => row,
}));

jest.mock('@/lib/organizations/audit', () => ({
  recordOrganizationAuditLog: (...args: any[]) => mockRecordOrganizationAuditLog(...args),
}));

jest.mock('@/lib/resource-versions', () => ({
  createResourceVersion: (...args: any[]) => mockCreateResourceVersion(...args),
}));

jest.mock('@/lib/supabase/server', () => ({
  supabaseAdmin: mockSupabaseAdmin,
}));

const baseProject = {
  id: 'project-1',
  user_id: 'user-1',
  organization_id: 'org-1',
  title: 'Launch Interview',
};

const baseOutput = {
  id: 'output-1',
  type: 'linkedin_post',
  platform: 'linkedin',
  title: 'LinkedIn Post',
  content: 'Generated draft body',
  status: 'generated',
  created_at: '2026-07-07T12:00:00.000Z',
  metadata: {
    originalOutputType: 'linkedin_post',
    platform: 'LinkedIn',
    theme: 'Professional',
    generationContext: {
      campaignId: 'campaign-1',
      campaignName: 'Launch plan',
      brandVoiceId: 'voice-1',
      brandVoiceName: 'Default voice',
      creatorProfileId: 'profile-1',
      creatorProfileName: 'Founder',
    },
  },
};

const existingItem = {
  id: 'item-1',
  organizationId: 'org-1',
  clientId: null,
  creatorProfileId: null,
  libraryId: null,
  campaignId: null,
  brandVoiceId: null,
  projectId: 'project-1',
  outputId: 'output-1',
  title: 'LinkedIn Post',
  contentType: 'linkedin_post',
  platform: 'linkedin',
  status: 'draft',
  body: 'Generated draft body',
  excerpt: 'Generated draft body',
  sourceLabel: 'AI generation',
  tags: [],
  metadata: {},
  publishedAt: null,
  scheduledFor: null,
  approvedByUserId: null,
  approvedAt: null,
  generationContextSnapshot: {},
  ownerUserId: 'user-1',
  locked: false,
  createdBy: 'user-1',
  createdAt: '2026-07-07T12:00:00.000Z',
  updatedAt: '2026-07-07T12:00:00.000Z',
};

describe('project output library save route', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockOutputResult = { data: baseOutput, error: null };
    mockExistingRowsResult = { data: [], error: null };
    mockRequireProjectOwner.mockResolvedValue({
      user: { id: 'user-1' },
      project: baseProject,
    });
    mockRequireStudioAssetContext.mockResolvedValue({
      user: { id: 'user-1' },
      activeOrganizationId: 'org-1',
      organizationIds: ['personal-1', 'org-1'],
      organization: { id: 'org-1', type: 'workspace' },
      membership: { role: 'editor' },
    });
    mockIsDemoUser.mockReturnValue(false);
    mockCan.mockReturnValue(true);
    mockDecorateContentLibraryItemAccess.mockImplementation((item: any) => ({
      ...item,
      canEdit: true,
    }));
    mockRecordOrganizationAuditLog.mockResolvedValue(undefined);
    mockCreateResourceVersion.mockResolvedValue(null);
  });

  it('updates the existing generated library item into the selected collection', async () => {
    const { POST } = await import('@/app/api/projects/[id]/outputs/[outputId]/library/route');
    mockExistingRowsResult = { data: [existingItem], error: null };
    mockUpdateContentLibraryItem.mockResolvedValue({
      ...existingItem,
      libraryId: 'library-1',
    });

    const response = await POST(new Request('http://localhost/api/projects/project-1/outputs/output-1/library?organization_id=org-1', {
      method: 'POST',
      body: JSON.stringify({ libraryId: 'library-1' }),
    }) as any, { params: Promise.resolve({ id: 'project-1', outputId: 'output-1' }) });
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.contentItem.libraryId).toBe('library-1');
    expect(mockUpdateContentLibraryItem).toHaveBeenCalledWith(
      mockSupabaseAdmin,
      'org-1',
      'item-1',
      { libraryId: 'library-1' },
      { referenceOrganizationIds: ['personal-1', 'org-1'] }
    );
    expect(mockCreateContentLibraryItem).not.toHaveBeenCalled();
  });

  it('creates a library item from output metadata when no generated item exists', async () => {
    const { POST } = await import('@/app/api/projects/[id]/outputs/[outputId]/library/route');
    mockCreateContentLibraryItem.mockResolvedValue({
      ...existingItem,
      id: 'item-new',
      libraryId: 'library-1',
    });

    const response = await POST(new Request('http://localhost/api/projects/project-1/outputs/output-1/library?organization_id=org-1', {
      method: 'POST',
      body: JSON.stringify({ libraryId: 'library-1' }),
    }) as any, { params: Promise.resolve({ id: 'project-1', outputId: 'output-1' }) });
    const payload = await response.json();

    expect(response.status).toBe(201);
    expect(payload.contentItem.id).toBe('item-new');
    expect(mockCreateContentLibraryItem).toHaveBeenCalledWith(
      mockSupabaseAdmin,
      'org-1',
      'user-1',
      expect.objectContaining({
        title: 'LinkedIn Post',
        contentType: 'linkedin_post',
        platform: 'linkedin',
        body: 'Generated draft body',
        libraryId: 'library-1',
        projectId: 'project-1',
        outputId: 'output-1',
        campaignId: 'campaign-1',
        brandVoiceId: 'voice-1',
        creatorProfileId: 'profile-1',
      }),
      { referenceOrganizationIds: ['personal-1', 'org-1'] }
    );
  });
});
