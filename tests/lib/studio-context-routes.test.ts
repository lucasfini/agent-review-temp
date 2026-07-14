import { OrganizationAccessError } from '@/lib/authz/types';

const mockRequireActiveOrganizationForUser = jest.fn();
const mockRequirePermissionContext = jest.fn();
const mockRequireStudioAssetContext = jest.fn();
const mockIsDemoUser = jest.fn();

const mockListCreatorProfilesForOrganizations = jest.fn();
const mockCreateCreatorProfile = jest.fn();
const mockGetCreatorProfileInOrganizations = jest.fn();
const mockShareCreatorProfileToOrganization = jest.fn();
const mockDeleteCreatorProfile = jest.fn();
const mockListContentLibraries = jest.fn();
const mockListContentLibrariesForOrganizations = jest.fn();
const mockCreateContentLibrary = jest.fn();
const mockGetContentLibraryInOrganizations = jest.fn();
const mockShareContentLibraryToOrganization = jest.fn();
const mockDeleteContentLibrary = jest.fn();
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

jest.mock('@/lib/demo-mode', () => ({
  isDemoUser: (...args: any[]) => mockIsDemoUser(...args),
}));

jest.mock('@/lib/organizations/audit', () => ({
  recordOrganizationAuditLog: (...args: any[]) => mockRecordOrganizationAuditLog(...args),
}));

jest.mock('@/lib/creator-profiles', () => {
  const actual = jest.requireActual('@/lib/creator-profiles');
  return {
    ...actual,
    listCreatorProfilesForOrganizations: (...args: any[]) => mockListCreatorProfilesForOrganizations(...args),
    createCreatorProfile: (...args: any[]) => mockCreateCreatorProfile(...args),
    getCreatorProfileInOrganizations: (...args: any[]) => mockGetCreatorProfileInOrganizations(...args),
    shareCreatorProfileToOrganization: (...args: any[]) => mockShareCreatorProfileToOrganization(...args),
    deleteCreatorProfile: (...args: any[]) => mockDeleteCreatorProfile(...args),
  };
});

jest.mock('@/lib/content-libraries', () => {
  const actual = jest.requireActual('@/lib/content-libraries');
  return {
    ...actual,
    listContentLibraries: (...args: any[]) => mockListContentLibraries(...args),
    listContentLibrariesForOrganizations: (...args: any[]) => mockListContentLibrariesForOrganizations(...args),
    createContentLibrary: (...args: any[]) => mockCreateContentLibrary(...args),
    getContentLibraryInOrganizations: (...args: any[]) => mockGetContentLibraryInOrganizations(...args),
    shareContentLibraryToOrganization: (...args: any[]) => mockShareContentLibraryToOrganization(...args),
    deleteContentLibrary: (...args: any[]) => mockDeleteContentLibrary(...args),
  };
});

jest.mock('@/lib/supabase/server', () => ({
  supabaseAdmin: { from: jest.fn() },
}));

const user = { id: 'user-1', email: 'user@example.com' };
const organization = { id: 'org-1', name: 'Creator Workspace', type: 'saas_customer' };
const privateOrganization = { id: 'personal-1', name: 'User Workspace', type: 'personal_legacy' };
const ownerMembership = { role: 'owner', status: 'active' };
const memberMembership = { role: 'editor', status: 'active' };

const creatorProfile = {
  id: 'profile-1',
  organizationId: 'org-1',
  clientId: null,
  sharedFromProfileId: null,
  name: 'Main profile',
  website: null,
  positioning: 'Creator context',
  audience: null,
  contentGoal: null,
  isDefault: true,
  createdBy: 'user-1',
  createdAt: '2026-06-21T00:00:00.000Z',
  updatedAt: '2026-06-21T00:00:00.000Z',
};

const contentLibrary = {
  id: 'library-1',
  organizationId: 'org-1',
  clientId: null,
  name: 'Launch library',
  description: null,
  createdBy: 'user-1',
  createdAt: '2026-06-21T00:00:00.000Z',
  updatedAt: '2026-06-21T00:00:00.000Z',
};

describe('Studio profile and library collection routes', () => {
  beforeEach(() => {
    mockRequireActiveOrganizationForUser.mockReset();
    mockRequirePermissionContext.mockReset();
    mockRequireStudioAssetContext.mockReset();
    mockIsDemoUser.mockReset();
    mockListCreatorProfilesForOrganizations.mockReset();
    mockCreateCreatorProfile.mockReset();
    mockGetCreatorProfileInOrganizations.mockReset();
    mockShareCreatorProfileToOrganization.mockReset();
    mockDeleteCreatorProfile.mockReset();
    mockListContentLibraries.mockReset();
    mockListContentLibrariesForOrganizations.mockReset();
    mockCreateContentLibrary.mockReset();
    mockGetContentLibraryInOrganizations.mockReset();
    mockShareContentLibraryToOrganization.mockReset();
    mockDeleteContentLibrary.mockReset();
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

  it('lists creator profiles for active organization members', async () => {
    const { GET } = await import('@/app/api/creator-profiles/route');
    mockListCreatorProfilesForOrganizations.mockResolvedValue([creatorProfile]);

    const response = await GET(new Request('http://localhost/api/creator-profiles?organization_id=org-1') as any);
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.creatorProfiles).toEqual([
      expect.objectContaining({
        id: 'profile-1',
        scope: 'organization',
        canEdit: true,
      }),
    ]);
    expect(payload.membership.canManageCreatorProfiles).toBe(true);
    expect(mockListCreatorProfilesForOrganizations).toHaveBeenCalledWith(
      expect.anything(),
      ['personal-1', 'org-1']
    );
  });

  it('creates team creator profiles by default in a team workspace', async () => {
    const { POST } = await import('@/app/api/creator-profiles/route');
    mockCreateCreatorProfile.mockResolvedValue({
      ...creatorProfile,
      organizationId: 'org-1',
    });

    const response = await POST(new Request('http://localhost/api/creator-profiles', {
      method: 'POST',
      body: JSON.stringify({ organization_id: 'org-1', name: 'Main profile' }),
    }) as any);
    const payload = await response.json();

    expect(response.status).toBe(201);
    expect(payload.creatorProfile).toEqual(expect.objectContaining({
      organizationId: 'org-1',
      scope: 'organization',
      canEdit: true,
    }));
    expect(mockCreateCreatorProfile).toHaveBeenCalledWith(expect.anything(), 'org-1', 'user-1', expect.objectContaining({
      name: 'Main profile',
    }));
  });

  it('allows non-admin members to create private creator profiles when requested', async () => {
    const { POST } = await import('@/app/api/creator-profiles/route');
    mockRequireStudioAssetContext.mockResolvedValue({
      user,
      organization,
      membership: memberMembership,
      privateOrganization,
      privateOrganizationId: privateOrganization.id,
      activeOrganizationId: organization.id,
      organizationIds: [privateOrganization.id, organization.id],
    });
    mockCreateCreatorProfile.mockResolvedValue({
      ...creatorProfile,
      id: 'profile-member',
      organizationId: 'personal-1',
      name: 'Member profile',
    });

    const response = await POST(new Request('http://localhost/api/creator-profiles', {
      method: 'POST',
      body: JSON.stringify({ organization_id: 'org-1', visibility: 'private', name: 'Member profile' }),
    }) as any);
    const payload = await response.json();

    expect(response.status).toBe(201);
    expect(payload.creatorProfile).toEqual(expect.objectContaining({
      id: 'profile-member',
      scope: 'private',
    }));
    expect(mockCreateCreatorProfile).toHaveBeenCalledWith(
      expect.anything(),
      'personal-1',
      'user-1',
      expect.objectContaining({ name: 'Member profile' })
    );
  });

  it('shares a private creator profile into the active workspace', async () => {
    const { POST } = await import('@/app/api/creator-profiles/[id]/share/route');
    const privateProfile = {
      ...creatorProfile,
      organizationId: 'personal-1',
    };
    const sharedProfile = {
      ...creatorProfile,
      id: 'shared-profile-1',
      organizationId: 'org-1',
      sharedFromProfileId: 'profile-1',
    };
    mockGetCreatorProfileInOrganizations.mockResolvedValue(privateProfile);
    mockShareCreatorProfileToOrganization.mockResolvedValue(sharedProfile);

    const response = await POST(
      new Request('http://localhost/api/creator-profiles/profile-1/share?organization_id=org-1', {
        method: 'POST',
      }) as any,
      { params: Promise.resolve({ id: 'profile-1' }) }
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.creatorProfile).toEqual(expect.objectContaining({
      id: 'shared-profile-1',
      scope: 'organization',
      canUnshare: true,
    }));
    expect(mockShareCreatorProfileToOrganization).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ id: 'profile-1', organizationId: 'personal-1' }),
      'org-1',
      'user-1'
    );
  });

  it('allows the creator to share their own private creator profile when they are an editor', async () => {
    const { POST } = await import('@/app/api/creator-profiles/[id]/share/route');
    mockRequireStudioAssetContext.mockResolvedValue({
      user,
      organization,
      membership: memberMembership,
      privateOrganization,
      privateOrganizationId: privateOrganization.id,
      activeOrganizationId: organization.id,
      organizationIds: [privateOrganization.id, organization.id],
    });

    const privateProfile = {
      ...creatorProfile,
      organizationId: 'personal-1',
      createdBy: 'user-1',
    };
    const sharedProfile = {
      ...creatorProfile,
      id: 'shared-profile-1',
      organizationId: 'org-1',
      sharedFromProfileId: 'profile-1',
    };
    mockGetCreatorProfileInOrganizations.mockResolvedValue(privateProfile);
    mockShareCreatorProfileToOrganization.mockResolvedValue(sharedProfile);

    const response = await POST(
      new Request('http://localhost/api/creator-profiles/profile-1/share?organization_id=org-1', {
        method: 'POST',
      }) as any,
      { params: Promise.resolve({ id: 'profile-1' }) }
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.creatorProfile).toEqual(expect.objectContaining({
      id: 'shared-profile-1',
      scope: 'organization',
    }));
    expect(mockShareCreatorProfileToOrganization).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ id: 'profile-1', organizationId: 'personal-1', createdBy: 'user-1' }),
      'org-1',
      'user-1'
    );
  });

  it('unshares a workspace creator profile without deleting the private source', async () => {
    const { DELETE } = await import('@/app/api/creator-profiles/[id]/share/route');
    const sharedProfile = {
      ...creatorProfile,
      id: 'shared-profile-1',
      organizationId: 'org-1',
      sharedFromProfileId: 'profile-1',
    };
    mockGetCreatorProfileInOrganizations.mockResolvedValue(sharedProfile);
    mockDeleteCreatorProfile.mockResolvedValue(true);

    const response = await DELETE(
      new Request('http://localhost/api/creator-profiles/shared-profile-1/share?organization_id=org-1') as any,
      { params: Promise.resolve({ id: 'shared-profile-1' }) }
    );

    expect(response.status).toBe(200);
    expect(mockDeleteCreatorProfile).toHaveBeenCalledWith(expect.anything(), 'org-1', 'shared-profile-1');
    expect(mockDeleteCreatorProfile).not.toHaveBeenCalledWith(expect.anything(), 'personal-1', 'profile-1');
  });

  it('lists content library collections', async () => {
    const { GET } = await import('@/app/api/content-libraries/route');
    mockListContentLibrariesForOrganizations.mockResolvedValue([contentLibrary]);

    const response = await GET(new Request('http://localhost/api/content-libraries?organization_id=org-1') as any);
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.contentLibraries).toEqual([
      expect.objectContaining({
        id: 'library-1',
        scope: 'organization',
        canEdit: true,
      }),
    ]);
    expect(payload.membership.canManageContentLibraries).toBe(true);
    expect(mockListContentLibrariesForOrganizations).toHaveBeenCalledWith(
      expect.anything(),
      ['personal-1', 'org-1']
    );
  });

  it('creates team content library collections by default for organization owners', async () => {
    const { POST } = await import('@/app/api/content-libraries/route');
    mockCreateContentLibrary.mockResolvedValue({
      ...contentLibrary,
      organizationId: 'org-1',
      scope: 'organization',
      canEdit: true,
    });

    const response = await POST(new Request('http://localhost/api/content-libraries', {
      method: 'POST',
      body: JSON.stringify({ organization_id: 'org-1', name: 'Launch library' }),
    }) as any);
    const payload = await response.json();

    expect(response.status).toBe(201);
    expect(payload.contentLibrary).toEqual(expect.objectContaining({
      organizationId: 'org-1',
      scope: 'organization',
    }));
    expect(mockCreateContentLibrary).toHaveBeenCalledWith(expect.anything(), 'org-1', 'user-1', expect.objectContaining({
      name: 'Launch library',
    }));
  });

  it('creates private content library collections when requested from a team workspace', async () => {
    const { POST } = await import('@/app/api/content-libraries/route');
    mockCreateContentLibrary.mockResolvedValue({
      ...contentLibrary,
      organizationId: 'personal-1',
      scope: 'private',
      canEdit: true,
    });

    const response = await POST(new Request('http://localhost/api/content-libraries', {
      method: 'POST',
      body: JSON.stringify({ organization_id: 'org-1', visibility: 'private', name: 'Private research' }),
    }) as any);
    const payload = await response.json();

    expect(response.status).toBe(201);
    expect(payload.contentLibrary).toEqual(expect.objectContaining({
      organizationId: 'personal-1',
      scope: 'private',
    }));
    expect(mockCreateContentLibrary).toHaveBeenCalledWith(expect.anything(), 'personal-1', 'user-1', expect.objectContaining({
      name: 'Private research',
      visibility: 'private',
    }));
  });

  it('shares private content library collections into the active workspace', async () => {
    const { POST } = await import('@/app/api/content-libraries/[id]/share/route');
    const privateLibrary = {
      ...contentLibrary,
      organizationId: 'personal-1',
      scope: 'private',
      canEdit: true,
      canShare: true,
    };
    const sharedLibrary = {
      ...contentLibrary,
      id: 'library-shared-1',
      organizationId: 'org-1',
      sharedFromLibraryId: 'library-1',
      scope: 'organization',
      canUnshare: true,
    };
    mockGetContentLibraryInOrganizations.mockResolvedValue(privateLibrary);
    mockShareContentLibraryToOrganization.mockResolvedValue(sharedLibrary);

    const response = await POST(
      new Request('http://localhost/api/content-libraries/library-1/share?organization_id=org-1', {
        method: 'POST',
      }) as any,
      { params: Promise.resolve({ id: 'library-1' }) }
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.contentLibrary).toEqual(expect.objectContaining({
      id: 'library-shared-1',
      scope: 'organization',
      canUnshare: true,
    }));
    expect(mockShareContentLibraryToOrganization).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ id: 'library-1', organizationId: 'personal-1' }),
      'org-1',
      'user-1'
    );
  });

  it('does not share content library collections into a personal workspace target', async () => {
    const { POST } = await import('@/app/api/content-libraries/[id]/share/route');
    mockRequireStudioAssetContext.mockResolvedValue({
      user,
      organization: privateOrganization,
      membership: ownerMembership,
      privateOrganization,
      privateOrganizationId: privateOrganization.id,
      activeOrganizationId: privateOrganization.id,
      organizationIds: [privateOrganization.id],
    });

    const response = await POST(
      new Request('http://localhost/api/content-libraries/library-1/share?organization_id=personal-1', {
        method: 'POST',
      }) as any,
      { params: Promise.resolve({ id: 'library-1' }) }
    );
    const payload = await response.json();

    expect(response.status).toBe(409);
    expect(payload.error).toBe('Switch to a team workspace before publishing this collection.');
    expect(mockGetContentLibraryInOrganizations).not.toHaveBeenCalled();
    expect(mockShareContentLibraryToOrganization).not.toHaveBeenCalled();
  });

  it('surfaces organization access errors', async () => {
    const { GET } = await import('@/app/api/content-libraries/route');
    mockRequireStudioAssetContext.mockRejectedValue(new OrganizationAccessError(403, 'No access'));

    const response = await GET(new Request('http://localhost/api/content-libraries?organization_id=other-org') as any);
    const payload = await response.json();

    expect(response.status).toBe(403);
    expect(payload.error).toBe('No access');
  });
});
