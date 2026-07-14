const mockGetOrganizationSubscription = jest.fn();

jest.mock('@/lib/billing/subscriptions', () => ({
  getOrganizationSubscription: (...args: any[]) => mockGetOrganizationSubscription(...args),
  getSubscriptionSeatLimit: (subscription?: any) => {
    const base = subscription?.plan?.limits?.seatLimit || 0;
    const extra = subscription?.extraSeatCount || 0;
    return base > 0 ? base + extra : null;
  },
  isSubscriptionUsable: (status?: string | null) => status === 'active' || status === 'trialing',
}));

function buildSupabaseMock(options: {
  activeMembers?: Array<{ id: string }>;
  pendingInvitations?: Array<{ id: string }>;
} = {}) {
  const calls: Array<{ table: string; state: { operation: string; payload?: unknown }; query: any }> = [];
  const activeMembers = options.activeMembers || [];
  const pendingInvitations = options.pendingInvitations || [];

  const rowsForTable = (table: string) => {
    if (table === 'organization_members') return activeMembers;
    if (table === 'organization_invitations') return pendingInvitations;
    return [];
  };

  const from = jest.fn((table: string) => {
    const state = { operation: 'select', payload: undefined as unknown };
    const query: any = {
      data: rowsForTable(table),
      error: null,
      select: jest.fn(() => {
        state.operation = 'select';
        query.data = rowsForTable(table);
        return query;
      }),
      update: jest.fn((payload: unknown) => {
        state.operation = 'update';
        state.payload = payload;
        query.data = null;
        return query;
      }),
      insert: jest.fn((payload: unknown) => {
        state.operation = 'insert';
        state.payload = payload;
        query.data = null;
        return query;
      }),
      eq: jest.fn(() => query),
      gt: jest.fn(() => query),
      lte: jest.fn(() => query),
      neq: jest.fn(() => query),
      maybeSingle: jest.fn(async () => ({ data: null, error: null })),
      single: jest.fn(async () => ({ data: null, error: null })),
    };
    calls.push({ table, state, query });
    return query;
  });

  return { from, calls };
}

describe('workspace seat enforcement', () => {
  beforeEach(() => {
    mockGetOrganizationSubscription.mockReset();
    mockGetOrganizationSubscription.mockResolvedValue({
      status: 'active',
      plan: {
        limits: {
          seatLimit: 3,
        },
      },
    });
  });

  it('counts active members and pending invitations against the current plan seat limit', async () => {
    const { getWorkspaceSeatSummary } = await import('@/lib/organizations/team');
    const supabase = buildSupabaseMock({
      activeMembers: [{ id: 'member-1' }, { id: 'member-2' }],
      pendingInvitations: [{ id: 'invite-1' }],
    });

    await expect(getWorkspaceSeatSummary(supabase as any, 'org-1')).resolves.toEqual({
      active: 2,
      pending: 1,
      limit: 3,
      available: 0,
      isFull: true,
    });
    expect(mockGetOrganizationSubscription).toHaveBeenCalledWith(supabase, 'org-1');
  });

  it('blocks new workspace invitations server-side when the plan seat limit is full', async () => {
    const { createWorkspaceInvitation } = await import('@/lib/organizations/team');
    mockGetOrganizationSubscription.mockResolvedValue({
      status: 'active',
      plan: {
        limits: {
          seatLimit: 2,
        },
      },
    });
    const supabase = buildSupabaseMock({
      activeMembers: [{ id: 'member-1' }, { id: 'member-2' }],
      pendingInvitations: [],
    });

    await expect(createWorkspaceInvitation({
      supabase: supabase as any,
      organizationId: 'org-1',
      email: 'new@example.com',
      role: 'editor',
      invitedBy: 'owner-1',
      now: new Date('2026-07-07T00:00:00.000Z'),
    })).rejects.toMatchObject({
      status: 409,
      message: 'Workspace seat limit reached',
    });
    expect(supabase.calls.some((call) => call.state.operation === 'insert')).toBe(false);
  });

  it('adds paid extra seats to the workspace seat limit', async () => {
    const { getWorkspaceSeatSummary } = await import('@/lib/organizations/team');
    mockGetOrganizationSubscription.mockResolvedValue({
      status: 'active',
      extraSeatCount: 2,
      plan: {
        limits: {
          seatLimit: 5,
        },
      },
    });
    const supabase = buildSupabaseMock({
      activeMembers: [
        { id: 'member-1' },
        { id: 'member-2' },
        { id: 'member-3' },
        { id: 'member-4' },
        { id: 'member-5' },
      ],
      pendingInvitations: [{ id: 'invite-1' }],
    });

    await expect(getWorkspaceSeatSummary(supabase as any, 'org-1')).resolves.toEqual({
      active: 5,
      pending: 1,
      limit: 7,
      available: 1,
      isFull: false,
    });
  });
});
