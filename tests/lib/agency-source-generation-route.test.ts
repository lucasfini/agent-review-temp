import { RouteAccessError } from '@/lib/api/route-auth';

const mockRequireAgencyClientAccess = jest.fn();
const mockCanManageAgencyDraft = jest.fn();
const mockGenerateAgencyDraftFromSource = jest.fn();
const mockIsDemoUser = jest.fn();

jest.mock('@/lib/authz/agency-permissions', () => {
  const actual = jest.requireActual('@/lib/authz/agency-permissions');
  return {
    ...actual,
    canManageAgencyDraft: (...args: any[]) => mockCanManageAgencyDraft(...args),
    requireAgencyClientAccess: (...args: any[]) => mockRequireAgencyClientAccess(...args),
  };
});

jest.mock('@/lib/agency-source-generation', () => {
  const actual = jest.requireActual('@/lib/agency-source-generation');
  return {
    ...actual,
    generateAgencyDraftFromSource: (...args: any[]) => mockGenerateAgencyDraftFromSource(...args),
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
  title: 'Generated LinkedIn draft',
  metadata: {
    generatedFromSourceImportId: 'source-1',
  },
};

function routeParams(id = 'source-1') {
  return { params: Promise.resolve({ id }) };
}

describe('agency source-to-draft generation route', () => {
  beforeEach(() => {
    mockRequireAgencyClientAccess.mockReset();
    mockCanManageAgencyDraft.mockReset();
    mockGenerateAgencyDraftFromSource.mockReset();
    mockIsDemoUser.mockReset();

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
    mockCanManageAgencyDraft.mockReturnValue(true);
    mockGenerateAgencyDraftFromSource.mockResolvedValue(draft);
    mockIsDemoUser.mockReturnValue(false);
  });

  it('generates an internal agency draft from a scoped source import', async () => {
    const { POST } = await import('@/app/api/agency/source-imports/[id]/generate/route');

    const response = await POST(new Request('http://localhost/api/agency/source-imports/source-1/generate', {
      method: 'POST',
      body: JSON.stringify({
        organization_id: 'agency-org',
        client_id: 'client-1',
        content_type: 'linkedin_posts',
        channel: 'linkedin',
        instructions: 'Use client profile.',
        quantity: 2,
      }),
    }) as any, routeParams() as any);
    const payload = await response.json();

    expect(response.status).toBe(201);
    expect(payload.draft).toEqual(draft);
    expect(mockRequireAgencyClientAccess).toHaveBeenCalledWith(
      expect.anything(),
      'client-1',
      { requestedOrganizationId: 'agency-org' }
    );
    expect(mockGenerateAgencyDraftFromSource).toHaveBeenCalledWith(
      expect.anything(),
      'agency-org',
      'user-1',
      expect.objectContaining({
        sourceImportId: 'source-1',
        clientId: 'client-1',
        contentTypeId: 'linkedin_posts',
        channel: 'linkedin',
        quantity: 2,
      })
    );
  });

  it('denies SaaS organizations before generation', async () => {
    const { POST } = await import('@/app/api/agency/source-imports/[id]/generate/route');
    mockRequireAgencyClientAccess.mockRejectedValue(
      new RouteAccessError(403, 'Agency console access requires an internal agency organization')
    );

    const response = await POST(new Request('http://localhost/api/agency/source-imports/source-1/generate', {
      method: 'POST',
      body: JSON.stringify({
        organization_id: 'saas-org',
        client_id: 'client-1',
      }),
    }) as any, routeParams() as any);
    const payload = await response.json();

    expect(response.status).toBe(403);
    expect(payload.error).toBe('Agency console access requires an internal agency organization');
    expect(mockGenerateAgencyDraftFromSource).not.toHaveBeenCalled();
  });

  it('checks agency access before validating generation content settings', async () => {
    const { POST } = await import('@/app/api/agency/source-imports/[id]/generate/route');
    mockRequireAgencyClientAccess.mockRejectedValue(
      new RouteAccessError(403, 'Agency console access requires an internal agency organization')
    );

    const response = await POST(new Request('http://localhost/api/agency/source-imports/source-1/generate', {
      method: 'POST',
      body: JSON.stringify({
        organization_id: 'saas-org',
        client_id: 'client-1',
        content_type: 'unsupported_type',
      }),
    }) as any, routeParams() as any);
    const payload = await response.json();

    expect(response.status).toBe(403);
    expect(payload.error).toBe('Agency console access requires an internal agency organization');
    expect(mockGenerateAgencyDraftFromSource).not.toHaveBeenCalled();
  });

  it('blocks demo users from writing generated drafts', async () => {
    const { POST } = await import('@/app/api/agency/source-imports/[id]/generate/route');
    mockIsDemoUser.mockReturnValue(true);

    const response = await POST(new Request('http://localhost/api/agency/source-imports/source-1/generate', {
      method: 'POST',
      body: JSON.stringify({
        organization_id: 'agency-org',
        client_id: 'client-1',
      }),
    }) as any, routeParams() as any);
    const payload = await response.json();

    expect(response.status).toBe(403);
    expect(payload.error).toBe('Demo account is read-only');
    expect(mockGenerateAgencyDraftFromSource).not.toHaveBeenCalled();
  });

  it('blocks agency members because current draft rules are admin-only', async () => {
    const { POST } = await import('@/app/api/agency/source-imports/[id]/generate/route');
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
    mockCanManageAgencyDraft.mockReturnValue(false);

    const response = await POST(new Request('http://localhost/api/agency/source-imports/source-1/generate', {
      method: 'POST',
      body: JSON.stringify({
        organization_id: 'agency-org',
        client_id: 'client-1',
      }),
    }) as any, routeParams() as any);
    const payload = await response.json();

    expect(response.status).toBe(403);
    expect(payload.error).toBe('Agency source generation requires internal agency draft management access');
    expect(mockGenerateAgencyDraftFromSource).not.toHaveBeenCalled();
  });

  it('rejects body source ids that do not match the route source id', async () => {
    const { POST } = await import('@/app/api/agency/source-imports/[id]/generate/route');

    const response = await POST(new Request('http://localhost/api/agency/source-imports/source-1/generate', {
      method: 'POST',
      body: JSON.stringify({
        organization_id: 'agency-org',
        client_id: 'client-1',
        source_import_id: 'source-2',
      }),
    }) as any, routeParams() as any);
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.error).toBe('source_import_id does not match route source id');
    expect(mockRequireAgencyClientAccess).toHaveBeenCalledWith(
      expect.anything(),
      'client-1',
      { requestedOrganizationId: 'agency-org' }
    );
    expect(mockGenerateAgencyDraftFromSource).not.toHaveBeenCalled();
  });
});
