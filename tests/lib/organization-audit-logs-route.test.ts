const mockRequirePermissionContext = jest.fn();
const mockListOrganizationAuditLogs = jest.fn();

jest.mock('@/lib/authz/permissions', () => {
  const actual = jest.requireActual('@/lib/authz/permissions');
  return {
    ...actual,
    requirePermissionContext: (...args: any[]) => mockRequirePermissionContext(...args),
  };
});

jest.mock('@/lib/organizations/audit', () => ({
  listOrganizationAuditLogs: (...args: any[]) => mockListOrganizationAuditLogs(...args),
}));

jest.mock('@/lib/supabase/server', () => ({
  supabaseAdmin: { from: jest.fn() },
}));

const user = { id: 'user-1', email: 'owner@example.com' };
const organization = { id: 'org-1', name: 'Acme Workspace', type: 'saas_customer' };

describe('organization audit log route', () => {
  beforeEach(() => {
    mockRequirePermissionContext.mockReset();
    mockListOrganizationAuditLogs.mockReset();
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
    mockListOrganizationAuditLogs.mockResolvedValue([
      {
        id: 'log-1',
        action: 'member.invited',
        resourceType: 'organization_invitation',
        resourceId: 'invite-1',
        actorUserId: 'user-1',
        actorEmail: 'owner@example.com',
        actorName: 'Owner',
        createdAt: '2026-06-22T12:00:00.000Z',
        metadata: { email: 'reader@example.com' },
      },
    ]);
  });

  it('allows owners and admins to read organization audit logs', async () => {
    const { GET } = await import('@/app/api/organizations/audit-logs/route');

    const response = await GET(
      new Request('http://localhost/api/organizations/audit-logs?organization_id=org-1&limit=10') as any
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.auditLogs).toHaveLength(1);
    expect(mockListOrganizationAuditLogs).toHaveBeenCalledWith(expect.objectContaining({
      organizationId: 'org-1',
      limit: 10,
    }));
  });

  it('blocks readers from reading organization audit logs', async () => {
    const { GET } = await import('@/app/api/organizations/audit-logs/route');
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
      new Request('http://localhost/api/organizations/audit-logs?organization_id=org-1') as any
    );
    const payload = await response.json();

    expect(response.status).toBe(403);
    expect(payload.error).toContain('audit logs');
    expect(mockListOrganizationAuditLogs).not.toHaveBeenCalled();
  });
});
