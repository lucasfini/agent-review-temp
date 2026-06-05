import { OrganizationAccessError } from '@/lib/authz/types';

const mockRequireActiveOrganizationForUser = jest.fn();
const mockListBrandVoices = jest.fn();
const mockCreateBrandVoice = jest.fn();
const mockGetBrandVoice = jest.fn();
const mockUpdateBrandVoice = jest.fn();
const mockDeleteBrandVoice = jest.fn();
const mockIsDemoUser = jest.fn();

jest.mock('@/lib/authz/permissions', () => ({
  requireActiveOrganizationForUser: (...args: any[]) => mockRequireActiveOrganizationForUser(...args),
}));

jest.mock('@/lib/brand-voices', () => {
  const actual = jest.requireActual('@/lib/brand-voices');
  return {
    ...actual,
    listBrandVoices: (...args: any[]) => mockListBrandVoices(...args),
    createBrandVoice: (...args: any[]) => mockCreateBrandVoice(...args),
    getBrandVoice: (...args: any[]) => mockGetBrandVoice(...args),
    updateBrandVoice: (...args: any[]) => mockUpdateBrandVoice(...args),
    deleteBrandVoice: (...args: any[]) => mockDeleteBrandVoice(...args),
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
const brandVoice = {
  id: 'voice-1',
  organizationId: 'org-1',
  clientId: null,
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
    mockListBrandVoices.mockReset();
    mockCreateBrandVoice.mockReset();
    mockGetBrandVoice.mockReset();
    mockUpdateBrandVoice.mockReset();
    mockDeleteBrandVoice.mockReset();
    mockIsDemoUser.mockReset();

    mockRequireActiveOrganizationForUser.mockResolvedValue({
      user,
      organization,
      membership: ownerMembership,
    });
    mockIsDemoUser.mockReturnValue(false);
  });

  it('lists brand voices for the requested organization context', async () => {
    const { GET } = await import('@/app/api/brand-voices/route');
    mockListBrandVoices.mockResolvedValue([brandVoice]);

    const response = await GET(
      new Request('http://localhost/api/brand-voices?organization_id=org-1') as any
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.brandVoices).toEqual([brandVoice]);
    expect(payload.membership.canManageBrandVoice).toBe(true);
    expect(mockRequireActiveOrganizationForUser).toHaveBeenCalledWith(
      expect.anything(),
      { requestedOrganizationId: 'org-1' }
    );
    expect(mockListBrandVoices).toHaveBeenCalledWith(expect.anything(), 'org-1');
  });

  it('does not list brand voices when organization access is denied', async () => {
    const { GET } = await import('@/app/api/brand-voices/route');
    mockRequireActiveOrganizationForUser.mockRejectedValue(new OrganizationAccessError(403, 'Forbidden'));

    const response = await GET(
      new Request('http://localhost/api/brand-voices?organization_id=other-org') as any
    );
    const payload = await response.json();

    expect(response.status).toBe(403);
    expect(payload).toEqual({ error: 'Forbidden' });
    expect(mockListBrandVoices).not.toHaveBeenCalled();
  });

  it('creates a brand voice for organization owners', async () => {
    const { POST } = await import('@/app/api/brand-voices/route');
    mockCreateBrandVoice.mockResolvedValue(brandVoice);

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
    expect(payload.brandVoice).toEqual(brandVoice);
    expect(mockCreateBrandVoice).toHaveBeenCalledWith(
      expect.anything(),
      'org-1',
      'user-1',
      expect.objectContaining({ name: 'Default voice', tone: 'Direct' })
    );
  });

  it('blocks non-admin members from creating brand voices', async () => {
    const { POST } = await import('@/app/api/brand-voices/route');
    mockRequireActiveOrganizationForUser.mockResolvedValue({
      user,
      organization,
      membership: memberMembership,
    });

    const response = await POST(new Request('http://localhost/api/brand-voices', {
      method: 'POST',
      body: JSON.stringify({ organization_id: 'org-1', name: 'Member edit' }),
    }) as any);
    const payload = await response.json();

    expect(response.status).toBe(403);
    expect(payload.error).toBe('Brand voice management requires organization owner or admin access');
    expect(mockCreateBrandVoice).not.toHaveBeenCalled();
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
    mockUpdateBrandVoice.mockResolvedValue(null);

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
