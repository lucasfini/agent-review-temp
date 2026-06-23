const mockRequireActiveOrganizationForUser = jest.fn();
const mockRequirePermissionContext = jest.fn();
const mockRequireAuthenticatedUser = jest.fn();
const mockIsDemoUser = jest.fn();
const mockCreateWorkspaceInvitation = jest.fn();
const mockAcceptWorkspaceInvitation = jest.fn();
const mockResendWorkspaceInvitation = jest.fn();
const mockCancelWorkspaceInvitation = jest.fn();
const mockUpdateWorkspaceMember = jest.fn();
const mockGetWorkspaceSeatSummary = jest.fn();
const mockGetWorkspaceMember = jest.fn();
const mockSendWorkspaceInvitationEmail = jest.fn();
const mockSetActiveOrganizationForUser = jest.fn();
const mockRecordOrganizationAuditLog = jest.fn();
const originalEnableDevInviteLinks = process.env.ENABLE_DEV_INVITE_LINKS;

jest.mock('@/lib/authz/permissions', () => {
  const actual = jest.requireActual('@/lib/authz/permissions');
  return {
    ...actual,
    requireActiveOrganizationForUser: (...args: any[]) => mockRequireActiveOrganizationForUser(...args),
    requirePermissionContext: (...args: any[]) => mockRequirePermissionContext(...args),
  };
});

jest.mock('@/lib/authz/organization-context', () => ({
  setActiveOrganizationForUser: (...args: any[]) => mockSetActiveOrganizationForUser(...args),
}));

jest.mock('@/lib/api/route-auth', () => {
  class RouteAccessError extends Error {
    status: number;

    constructor(status: number, message: string) {
      super(message);
      this.status = status;
      this.name = 'RouteAccessError';
    }
  }

  return {
    RouteAccessError,
    requireAuthenticatedUser: (...args: any[]) => mockRequireAuthenticatedUser(...args),
  };
});

jest.mock('@/lib/demo-mode', () => ({
  isDemoUser: (...args: any[]) => mockIsDemoUser(...args),
}));

jest.mock('@/lib/organizations/team', () => {
  const actual = jest.requireActual('@/lib/organizations/team');
  return {
    ...actual,
    createWorkspaceInvitation: (...args: any[]) => mockCreateWorkspaceInvitation(...args),
    acceptWorkspaceInvitation: (...args: any[]) => mockAcceptWorkspaceInvitation(...args),
    resendWorkspaceInvitation: (...args: any[]) => mockResendWorkspaceInvitation(...args),
    cancelWorkspaceInvitation: (...args: any[]) => mockCancelWorkspaceInvitation(...args),
    updateWorkspaceMember: (...args: any[]) => mockUpdateWorkspaceMember(...args),
    getWorkspaceSeatSummary: (...args: any[]) => mockGetWorkspaceSeatSummary(...args),
    getWorkspaceMember: (...args: any[]) => mockGetWorkspaceMember(...args),
  };
});

jest.mock('@/lib/organizations/invitation-mailer', () => ({
  sendWorkspaceInvitationEmail: (...args: any[]) => mockSendWorkspaceInvitationEmail(...args),
}));

jest.mock('@/lib/organizations/audit', () => ({
  recordOrganizationAuditLog: (...args: any[]) => mockRecordOrganizationAuditLog(...args),
}));

jest.mock('@/lib/supabase/server', () => ({
  supabaseAdmin: { from: jest.fn() },
}));

const user = { id: 'user-1', email: 'owner@example.com' };
const organization = { id: 'org-1', name: 'Acme Workspace', type: 'saas_customer' };
const ownerMembership = { role: 'owner', status: 'active' };
const memberMembership = { role: 'editor', status: 'active' };
const seats = { active: 1, pending: 0, limit: 3, available: 2, isFull: false };
const invitation = {
  id: 'invite-1',
  organizationId: 'org-1',
  email: 'teammate@example.com',
  role: 'editor',
  status: 'pending',
  expiresAt: '2026-07-06T00:00:00.000Z',
  createdAt: '2026-06-22T00:00:00.000Z',
};

describe('workspace invitation routes', () => {
  beforeEach(() => {
    mockRequireActiveOrganizationForUser.mockReset();
    mockRequirePermissionContext.mockReset();
    mockRequireAuthenticatedUser.mockReset();
    mockIsDemoUser.mockReset();
    mockCreateWorkspaceInvitation.mockReset();
    mockAcceptWorkspaceInvitation.mockReset();
    mockResendWorkspaceInvitation.mockReset();
    mockCancelWorkspaceInvitation.mockReset();
    mockUpdateWorkspaceMember.mockReset();
    mockGetWorkspaceSeatSummary.mockReset();
    mockGetWorkspaceMember.mockReset();
    mockSendWorkspaceInvitationEmail.mockReset();
    mockSetActiveOrganizationForUser.mockReset();
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
    mockRequireAuthenticatedUser.mockResolvedValue({ id: 'invitee-1', email: 'teammate@example.com' });
    mockIsDemoUser.mockReturnValue(false);
    mockCreateWorkspaceInvitation.mockResolvedValue({
      invitation,
      token: 'raw-token',
      acceptUrl: 'http://localhost:3000/invite?token=raw-token',
      seats,
    });
    mockAcceptWorkspaceInvitation.mockResolvedValue({
      invitation: { ...invitation, status: 'accepted' },
      membership: {
        id: 'member-2',
        organization_id: 'org-1',
        role: 'editor',
        status: 'active',
        joined_at: '2026-06-22T00:00:00.000Z',
      },
    });
    mockResendWorkspaceInvitation.mockResolvedValue({
      invitation,
      token: 'new-token',
      acceptUrl: 'http://localhost:3000/invite?token=new-token',
      seats,
    });
    mockCancelWorkspaceInvitation.mockResolvedValue({ ...invitation, status: 'canceled' });
    mockUpdateWorkspaceMember.mockResolvedValue({
      id: 'member-2',
      email: 'teammate@example.com',
      organizationId: 'org-1',
      role: 'admin',
      status: 'active',
    });
    mockGetWorkspaceSeatSummary.mockResolvedValue(seats);
    mockGetWorkspaceMember.mockResolvedValue({
      id: 'member-2',
      email: 'teammate@example.com',
      role: 'editor',
      status: 'active',
    });
    mockSendWorkspaceInvitationEmail.mockResolvedValue({ delivered: true });
    mockRecordOrganizationAuditLog.mockResolvedValue(undefined);
    mockSetActiveOrganizationForUser.mockResolvedValue({
      organization,
      membership: { role: 'editor', status: 'active' },
    });
  });

  afterEach(() => {
    if (originalEnableDevInviteLinks === undefined) {
      delete process.env.ENABLE_DEV_INVITE_LINKS;
    } else {
      process.env.ENABLE_DEV_INVITE_LINKS = originalEnableDevInviteLinks;
    }
  });

  it('allows workspace owners to create email invitations', async () => {
    const { POST } = await import('@/app/api/organizations/invitations/route');

    const response = await POST(new Request('http://localhost/api/organizations/invitations', {
      method: 'POST',
      body: JSON.stringify({ organization_id: 'org-1', email: 'teammate@example.com', role: 'editor' }),
    }) as any);
    const payload = await response.json();

    expect(response.status).toBe(201);
    expect(payload.invitation.email).toBe('teammate@example.com');
    expect(payload).not.toHaveProperty('token');
    expect(payload).not.toHaveProperty('acceptUrl');
    expect(payload).not.toHaveProperty('inviteLink');
    expect(mockCreateWorkspaceInvitation).toHaveBeenCalledWith(expect.objectContaining({
      organizationId: 'org-1',
      email: 'teammate@example.com',
      role: 'editor',
      invitedBy: 'user-1',
    }));
    expect(mockSendWorkspaceInvitationEmail).toHaveBeenCalledWith(expect.objectContaining({
      acceptUrl: 'http://localhost:3000/invite?token=raw-token',
      invitedByEmail: 'owner@example.com',
      workspaceName: 'Acme Workspace',
    }));
  });

  it('exposes a local invite link without sending email when dev invite links are enabled', async () => {
    process.env.ENABLE_DEV_INVITE_LINKS = 'true';

    const { POST } = await import('@/app/api/organizations/invitations/route');

    const response = await POST(new Request('http://localhost/api/organizations/invitations', {
      method: 'POST',
      body: JSON.stringify({ organization_id: 'org-1', email: 'teammate@example.com', role: 'editor' }),
    }) as any);
    const payload = await response.json();

    expect(response.status).toBe(201);
    expect(payload.inviteLink).toBe('http://localhost:3000/invite?token=raw-token');
    expect(payload.emailDelivery).toEqual({
      delivered: false,
      reason: 'Invite link generated for local testing',
    });
    expect(mockSendWorkspaceInvitationEmail).not.toHaveBeenCalled();
  });

  it('blocks non-admin members from creating invitations', async () => {
    const { POST } = await import('@/app/api/organizations/invitations/route');
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

    const response = await POST(new Request('http://localhost/api/organizations/invitations', {
      method: 'POST',
      body: JSON.stringify({ organization_id: 'org-1', email: 'teammate@example.com' }),
    }) as any);

    expect(response.status).toBe(403);
    expect(mockCreateWorkspaceInvitation).not.toHaveBeenCalled();
  });

  it('blocks demo users from creating invitations', async () => {
    const { POST } = await import('@/app/api/organizations/invitations/route');
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

    const response = await POST(new Request('http://localhost/api/organizations/invitations', {
      method: 'POST',
      body: JSON.stringify({ organization_id: 'org-1', email: 'teammate@example.com' }),
    }) as any);

    expect(response.status).toBe(403);
    expect(mockCreateWorkspaceInvitation).not.toHaveBeenCalled();
  });

  it('surfaces invite validation and seat-limit errors', async () => {
    const { POST } = await import('@/app/api/organizations/invitations/route');
    const { WorkspaceTeamError } = await import('@/lib/organizations/team');
    mockCreateWorkspaceInvitation.mockRejectedValue(new WorkspaceTeamError(409, 'Workspace seat limit reached'));

    const response = await POST(new Request('http://localhost/api/organizations/invitations', {
      method: 'POST',
      body: JSON.stringify({ organization_id: 'org-1', email: 'full@example.com' }),
    }) as any);
    const payload = await response.json();

    expect(response.status).toBe(409);
    expect(payload.error).toBe('Workspace seat limit reached');
  });

  it('accepts invites through the signed-in user email', async () => {
    const { POST } = await import('@/app/api/organizations/invitations/accept/route');

    const response = await POST(new Request('http://localhost/api/organizations/invitations/accept', {
      method: 'POST',
      body: JSON.stringify({ token: 'raw-token' }),
    }) as any);
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.membership.organizationId).toBe('org-1');
    expect(payload.organization).toEqual({
      id: 'org-1',
      name: 'Acme Workspace',
      type: 'saas_customer',
    });
    expect(mockAcceptWorkspaceInvitation).toHaveBeenCalledWith(expect.objectContaining({
      token: 'raw-token',
      userId: 'invitee-1',
      userEmail: 'teammate@example.com',
    }));
    expect(mockSetActiveOrganizationForUser).toHaveBeenCalledWith(
      expect.anything(),
      'invitee-1',
      'org-1'
    );
  });

  it('surfaces accept failures for mismatched emails', async () => {
    const { POST } = await import('@/app/api/organizations/invitations/accept/route');
    const { WorkspaceTeamError } = await import('@/lib/organizations/team');
    mockAcceptWorkspaceInvitation.mockRejectedValue(
      new WorkspaceTeamError(403, 'Sign in with the invited email address to accept this workspace invite')
    );

    const response = await POST(new Request('http://localhost/api/organizations/invitations/accept', {
      method: 'POST',
      body: JSON.stringify({ token: 'raw-token' }),
    }) as any);
    const payload = await response.json();

    expect(response.status).toBe(403);
    expect(payload.error).toContain('invited email address');
  });

  it('blocks demo users from accepting workspace invites', async () => {
    const { POST } = await import('@/app/api/organizations/invitations/accept/route');
    mockRequireAuthenticatedUser.mockResolvedValue({ id: 'invitee-1', email: 'teammate@example.com' });
    mockIsDemoUser.mockReturnValue(true);

    const response = await POST(new Request('http://localhost/api/organizations/invitations/accept', {
      method: 'POST',
      body: JSON.stringify({ token: 'raw-token' }),
    }) as any);
    const payload = await response.json();

    expect(response.status).toBe(403);
    expect(payload.error).toBe('Demo account is read-only');
    expect(mockAcceptWorkspaceInvitation).not.toHaveBeenCalled();
  });

  it('allows owners to resend and cancel pending invites', async () => {
    const resendRoute = await import('@/app/api/organizations/invitations/[id]/resend/route');
    const cancelRoute = await import('@/app/api/organizations/invitations/[id]/route');

    const resendResponse = await resendRoute.POST(
      new Request('http://localhost/api/organizations/invitations/invite-1/resend?organization_id=org-1', {
        method: 'POST',
        body: JSON.stringify({ organization_id: 'org-1' }),
      }) as any,
      { params: Promise.resolve({ id: 'invite-1' }) }
    );
    const cancelResponse = await cancelRoute.DELETE(
      new Request('http://localhost/api/organizations/invitations/invite-1?organization_id=org-1') as any,
      { params: Promise.resolve({ id: 'invite-1' }) }
    );

    expect(resendResponse.status).toBe(200);
    expect(cancelResponse.status).toBe(200);
    expect(mockResendWorkspaceInvitation).toHaveBeenCalledWith(expect.objectContaining({ invitationId: 'invite-1' }));
    expect(mockCancelWorkspaceInvitation).toHaveBeenCalledWith(expect.anything(), 'org-1', 'invite-1');
  });

  it('allows owners to update member roles and removal status', async () => {
    const { PATCH } = await import('@/app/api/organizations/members/[id]/route');

    const response = await PATCH(
      new Request('http://localhost/api/organizations/members/member-2', {
        method: 'PATCH',
        body: JSON.stringify({ organization_id: 'org-1', role: 'admin' }),
      }) as any,
      { params: Promise.resolve({ id: 'member-2' }) }
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.member.role).toBe('admin');
    expect(mockUpdateWorkspaceMember).toHaveBeenCalledWith(expect.objectContaining({
      memberId: 'member-2',
      role: 'admin',
      remove: false,
      actorRole: 'owner',
    }));
  });

  it('blocks owners from assigning owner without owner actor role', async () => {
    const { PATCH } = await import('@/app/api/organizations/members/[id]/route');
    const { WorkspaceTeamError } = await import('@/lib/organizations/team');

    mockRequirePermissionContext.mockResolvedValue({
      user,
      organization,
      membership: { role: 'admin' as const, status: 'active' },
      permissionContext: {
        userId: user.id,
        organizationId: organization.id,
        organizationType: organization.type,
        role: 'admin',
        isDemo: false,
      },
    });
    mockUpdateWorkspaceMember.mockRejectedValue(new WorkspaceTeamError(403, 'Only workspace owner can assign another owner'));

    const response = await PATCH(
      new Request('http://localhost/api/organizations/members/member-2', {
        method: 'PATCH',
        body: JSON.stringify({ organization_id: 'org-1', role: 'owner' }),
      }) as any,
      { params: Promise.resolve({ id: 'member-2' }) }
    );

    expect(response.status).toBe(403);
    expect(mockUpdateWorkspaceMember).toHaveBeenCalledWith(expect.objectContaining({
      actorRole: 'admin',
      role: 'owner',
    }));
  });

  it('allows owner transfer to another active member', async () => {
    const { PATCH } = await import('@/app/api/organizations/members/[id]/route');

    const response = await PATCH(
      new Request('http://localhost/api/organizations/members/member-2', {
        method: 'PATCH',
        body: JSON.stringify({ organization_id: 'org-1', role: 'owner' }),
      }) as any,
      { params: Promise.resolve({ id: 'member-2' }) }
    );

    expect(response.status).toBe(200);
    expect(mockUpdateWorkspaceMember).toHaveBeenCalledWith(expect.objectContaining({
      actorRole: 'owner',
      role: 'owner',
    }));
  });
});
