import { OrganizationAccessError } from '@/lib/authz/types';

const mockRequireActiveOrganizationForUser = jest.fn();
const mockRequirePermissionContext = jest.fn();
const mockRequireStudioAssetContext = jest.fn();
const mockListBrandVoicesForOrganizations = jest.fn();
const mockCreateBrandVoice = jest.fn();
const mockGetBrandVoiceInOrganizations = jest.fn();
const mockUpdateBrandVoice = jest.fn();
const mockDeleteBrandVoice = jest.fn();
const mockIsDemoUser = jest.fn();
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

jest.mock('@/lib/brand-voices', () => {
  const actual = jest.requireActual('@/lib/brand-voices');
  return {
    ...actual,
    listBrandVoicesForOrganizations: (...args: any[]) => mockListBrandVoicesForOrganizations(...args),
    createBrandVoice: (...args: any[]) => mockCreateBrandVoice(...args),
    getBrandVoiceInOrganizations: (...args: any[]) => mockGetBrandVoiceInOrganizations(...args),
    updateBrandVoice: (...args: any[]) => mockUpdateBrandVoice(...args),
    deleteBrandVoice: (...args: any[]) => mockDeleteBrandVoice(...args),
  };
});

jest.mock('@/lib/demo-mode', () => ({
  isDemoUser: (...args: any[]) => mockIsDemoUser(...args),
}));

jest.mock('@/lib/organizations/audit', () => ({
  recordOrganizationAuditLog: (...args: any[]) => mockRecordOrganizationAuditLog(...args),
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
const brandVoice = {
  id: 'voice-1',
  organizationId: 'org-1',
  clientId: null,
  sharedFromVoiceId: null,
  name: 'Default voice',
  description: null,
  tone: 'Direct',
  audience: null,
  contentPillars: [],
  writingExamples: [],
  bannedPhrases: [],
  ctaPreferences: null,
  createdBy: 'user-1',
  createdAt: '2026-06-05T00:00:00.000Z',
  updatedAt: '2026-06-05T00:00:00.000Z',
};

describe('brand voice routes', () => {
  beforeEach(() => {
    mockRequireActiveOrganizationForUser.mockReset();
    mockRequirePermissionContext.mockReset();
    mockRequireStudioAssetContext.mockReset();
    mockListBrandVoicesForOrganizations.mockReset();
    mockCreateBrandVoice.mockReset();
    mockGetBrandVoiceInOrganizations.mockReset();
    mockUpdateBrandVoice.mockReset();
    mockDeleteBrandVoice.mockReset();
    mockIsDemoUser.mockReset();
    mockRecordOrganizationAuditLog.mockReset();

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
    mockRecordOrganizationAuditLog.mockResolvedValue(undefined);
  });

  it('lists brand voices for the requested organization context', async () => {
    const { GET } = await import('@/app/api/brand-voices/route');
    mockListBrandVoicesForOrganizations.mockResolvedValue([brandVoice]);

    const response = await GET(
      new Request('http://localhost/api/brand-voices?organization_id=org-1') as any
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.brandVoices).toEqual([
      expect.objectContaining({
        id: 'voice-1',
        scope: 'organization',
        canEdit: true,
      }),
    ]);
    expect(payload.membership.canManageBrandVoice).toBe(true);
    expect(mockRequireStudioAssetContext).toHaveBeenCalledWith(
      expect.anything(),
      { requestedOrganizationId: 'org-1' }
    );
    expect(mockListBrandVoicesForOrganizations).toHaveBeenCalledWith(expect.anything(), ['personal-1', 'org-1']);
  });

  it('does not list brand voices when organization access is denied', async () => {
    const { GET } = await import('@/app/api/brand-voices/route');
    mockRequireStudioAssetContext.mockRejectedValue(new OrganizationAccessError(403, 'Forbidden'));

    const response = await GET(
      new Request('http://localhost/api/brand-voices?organization_id=other-org') as any
    );
    const payload = await response.json();

    expect(response.status).toBe(403);
    expect(payload).toEqual({ error: 'Forbidden' });
    expect(mockListBrandVoicesForOrganizations).not.toHaveBeenCalled();
  });

  it('creates a team brand voice by default in a team workspace', async () => {
    const { POST } = await import('@/app/api/brand-voices/route');
    mockCreateBrandVoice.mockResolvedValue({
      ...brandVoice,
      organizationId: 'org-1',
    });

    const response = await POST(new Request('http://localhost/api/brand-voices', {
      method: 'POST',
      body: JSON.stringify({
        organization_id: 'org-1',
        name: 'Default voice',
        tone: 'Direct',
      }),
    }) as any);
    const payload = await response.json();

    expect(response.status).toBe(201);
    expect(payload.brandVoice).toEqual(expect.objectContaining({
      organizationId: 'org-1',
      scope: 'organization',
      canEdit: true,
    }));
    expect(mockCreateBrandVoice).toHaveBeenCalledWith(
      expect.anything(),
      'org-1',
      'user-1',
      expect.objectContaining({ name: 'Default voice', tone: 'Direct' })
    );
  });

  it('allows non-admin members to create private brand voices when requested', async () => {
    const { POST } = await import('@/app/api/brand-voices/route');
    mockRequireStudioAssetContext.mockResolvedValue({
      user,
      organization,
      membership: memberMembership,
      privateOrganization,
      privateOrganizationId: privateOrganization.id,
      activeOrganizationId: organization.id,
      organizationIds: [privateOrganization.id, organization.id],
    });
    mockCreateBrandVoice.mockResolvedValue({
      ...brandVoice,
      id: 'voice-member',
      organizationId: 'personal-1',
      name: 'Member edit',
    });

    const response = await POST(new Request('http://localhost/api/brand-voices', {
      method: 'POST',
      body: JSON.stringify({ organization_id: 'org-1', visibility: 'private', name: 'Member edit' }),
    }) as any);
    const payload = await response.json();

    expect(response.status).toBe(201);
    expect(payload.brandVoice).toEqual(expect.objectContaining({
      id: 'voice-member',
      scope: 'private',
    }));
    expect(mockCreateBrandVoice).toHaveBeenCalledWith(
      expect.anything(),
      'personal-1',
      'user-1',
      expect.objectContaining({ name: 'Member edit' })
    );
  });

  it('blocks demo users from brand voice writes', async () => {
    const { POST } = await import('@/app/api/brand-voices/route');
    mockIsDemoUser.mockReturnValue(true);

    const response = await POST(new Request('http://localhost/api/brand-voices', {
      method: 'POST',
      body: JSON.stringify({ organization_id: 'org-1', name: 'Demo edit' }),
    }) as any);
    const payload = await response.json();

    expect(response.status).toBe(403);
    expect(payload.error).toBe('Demo account is read-only');
    expect(mockCreateBrandVoice).not.toHaveBeenCalled();
  });

  it('updates an existing brand voice by id', async () => {
    const { PATCH } = await import('@/app/api/brand-voices/[id]/route');
    mockGetBrandVoiceInOrganizations.mockResolvedValue(brandVoice);
    mockUpdateBrandVoice.mockResolvedValue({ ...brandVoice, tone: 'Warm' });

    const response = await PATCH(new Request('http://localhost/api/brand-voices/voice-1', {
      method: 'PATCH',
      body: JSON.stringify({ organization_id: 'org-1', tone: 'Warm' }),
    }) as any, { params: Promise.resolve({ id: 'voice-1' }) });
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.brandVoice.tone).toBe('Warm');
    expect(mockUpdateBrandVoice).toHaveBeenCalledWith(
      expect.anything(),
      'org-1',
      'voice-1',
      expect.objectContaining({ tone: 'Warm' })
    );
  });

  it('returns 404 when updating a missing brand voice', async () => {
    const { PATCH } = await import('@/app/api/brand-voices/[id]/route');
    mockGetBrandVoiceInOrganizations.mockResolvedValue(null);

    const response = await PATCH(new Request('http://localhost/api/brand-voices/missing', {
      method: 'PATCH',
      body: JSON.stringify({ organization_id: 'org-1', tone: 'Warm' }),
    }) as any, { params: Promise.resolve({ id: 'missing' }) });
    const payload = await response.json();

    expect(response.status).toBe(404);
    expect(payload.error).toBe('Brand voice not found');
  });

  it('deletes an existing brand voice by id', async () => {
    const { DELETE } = await import('@/app/api/brand-voices/[id]/route');
    mockGetBrandVoiceInOrganizations.mockResolvedValue(brandVoice);
    mockDeleteBrandVoice.mockResolvedValue(true);

    const response = await DELETE(
      new Request('http://localhost/api/brand-voices/voice-1?organization_id=org-1') as any,
      { params: Promise.resolve({ id: 'voice-1' }) }
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toEqual({ success: true });
    expect(mockDeleteBrandVoice).toHaveBeenCalledWith(expect.anything(), 'org-1', 'voice-1');
  });
});
