const mockRequireAuthenticatedUser = jest.fn();
const mockListActiveOrganizationsForUser = jest.fn();
const mockUpdateUserById = jest.fn();
const mockProfileSelect = jest.fn();
const mockProfileUpsert = jest.fn();

let mockMissingOnboardingColumns = false;
let mockStaleOnboardingConstraint = false;
let mockStoredProfile: Record<string, unknown> | null = null;

const missingOnboardingColumnError = {
  code: 'PGRST204',
  message: "Could not find the 'onboarding_status' column of 'profiles' in the schema cache",
};

const staleOnboardingConstraintError = {
  code: '23514',
  message: 'new row for relation "profiles" violates check constraint "profiles_onboarding_status_check"',
};

const profileTable = () => ({
  select: (columns: string) => {
    mockProfileSelect(columns);
    return {
      eq: () => ({
        maybeSingle: async () => {
          if (mockMissingOnboardingColumns && columns.includes('onboarding_status')) {
            return { data: null, error: missingOnboardingColumnError };
          }

          return { data: mockStoredProfile, error: null };
        },
      }),
    };
  },
  upsert: async (payload: Record<string, unknown>, options: Record<string, unknown>) => {
    mockProfileUpsert(payload, options);

    if (mockMissingOnboardingColumns && 'onboarding_status' in payload) {
      return { error: missingOnboardingColumnError };
    }

    if (mockStaleOnboardingConstraint && 'onboarding_status' in payload) {
      return { error: staleOnboardingConstraintError };
    }

    mockStoredProfile = {
      ...(mockStoredProfile || {}),
      ...payload,
      onboarding_completed_at: mockStoredProfile?.onboarding_completed_at ?? null,
      onboarding_metadata_json: payload.onboarding_metadata_json
        ?? mockStoredProfile?.onboarding_metadata_json
        ?? null,
      onboarding_status: payload.onboarding_status
        ?? mockStoredProfile?.onboarding_status
        ?? null,
    };
    return { error: null };
  },
});

const mockFrom = jest.fn((table: string) => {
  if (table !== 'profiles') {
    throw new Error(`Unexpected table: ${table}`);
  }

  return profileTable();
});

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

jest.mock('@/lib/authz/organization-context', () => ({
  listActiveOrganizationsForUser: (...args: any[]) => mockListActiveOrganizationsForUser(...args),
}));

jest.mock('@/lib/supabase/server', () => ({
  supabaseAdmin: {
    from: (...args: any[]) => mockFrom(...args),
    auth: {
      admin: {
        updateUserById: (...args: any[]) => mockUpdateUserById(...args),
      },
    },
  },
}));

const user = {
  id: 'user-1',
  email: 'user@example.com',
  user_metadata: { onboarding_status: 'profile_pending' },
};

const buildRequest = (body: Record<string, unknown>) =>
  new Request('http://localhost/api/onboarding/profile', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

describe('POST /api/onboarding/profile', () => {
  beforeEach(() => {
    mockRequireAuthenticatedUser.mockReset();
    mockListActiveOrganizationsForUser.mockReset();
    mockUpdateUserById.mockReset();
    mockProfileSelect.mockClear();
    mockProfileUpsert.mockClear();
    mockFrom.mockClear();

    mockMissingOnboardingColumns = false;
    mockStaleOnboardingConstraint = false;
    mockStoredProfile = {
      id: 'user-1',
      email: 'user@example.com',
      first_name: null,
      last_name: null,
      full_name: null,
      onboarding_status: 'profile_pending',
      onboarding_completed_at: null,
      onboarding_metadata_json: { source: 'test' },
    };

    mockRequireAuthenticatedUser.mockResolvedValue(user);
    mockListActiveOrganizationsForUser.mockResolvedValue([]);
    mockUpdateUserById.mockResolvedValue({ error: null });
  });

  it('saves names and onboarding metadata when profile onboarding columns exist', async () => {
    const { POST } = await import('@/app/api/onboarding/profile/route');

    const response = await POST(buildRequest({
      firstName: ' Lucas ',
      lastName: ' North ',
    }) as any);
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.status).toBe('workspace_pending');
    expect(payload.profile).toEqual(expect.objectContaining({
      firstName: 'Lucas',
      lastName: 'North',
      fullName: 'Lucas North',
    }));
    expect(mockProfileUpsert).toHaveBeenCalledTimes(1);
    expect(mockProfileUpsert).toHaveBeenCalledWith(expect.objectContaining({
      first_name: 'Lucas',
      last_name: 'North',
      full_name: 'Lucas North',
      onboarding_status: 'workspace_pending',
      onboarding_metadata_json: expect.objectContaining({
        source: 'test',
        profileSavedAt: expect.any(String),
      }),
    }), { onConflict: 'id' });
    expect(mockUpdateUserById).toHaveBeenCalledWith('user-1', {
      user_metadata: expect.objectContaining({
        first_name: 'Lucas',
        last_name: 'North',
        full_name: 'Lucas North',
        onboarding_status: 'workspace_pending',
      }),
    });
  });

  it('falls back to core profile fields when onboarding columns are not deployed', async () => {
    mockMissingOnboardingColumns = true;
    mockStaleOnboardingConstraint = false;
    const { POST } = await import('@/app/api/onboarding/profile/route');

    const response = await POST(buildRequest({
      firstName: ' Lucas ',
      lastName: ' North ',
    }) as any);
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.status).toBe('workspace_pending');
    expect(payload.profile).toEqual(expect.objectContaining({
      firstName: 'Lucas',
      lastName: 'North',
      fullName: 'Lucas North',
    }));
    expect(mockProfileUpsert).toHaveBeenCalledTimes(2);
    expect(mockProfileUpsert.mock.calls[0][0]).toEqual(expect.objectContaining({
      onboarding_status: 'workspace_pending',
      onboarding_metadata_json: expect.any(Object),
    }));
    expect(mockProfileUpsert.mock.calls[1][0]).toEqual(expect.objectContaining({
      first_name: 'Lucas',
      last_name: 'North',
      full_name: 'Lucas North',
    }));
    expect(mockProfileUpsert.mock.calls[1][0]).not.toHaveProperty('onboarding_status');
    expect(mockProfileUpsert.mock.calls[1][0]).not.toHaveProperty('onboarding_metadata_json');
    expect(mockUpdateUserById).toHaveBeenCalledWith('user-1', {
      user_metadata: expect.objectContaining({
        first_name: 'Lucas',
        last_name: 'North',
        full_name: 'Lucas North',
        onboarding_status: 'workspace_pending',
      }),
    });
  });
});

describe('setUserOnboardingStatus', () => {
  beforeEach(() => {
    mockRequireAuthenticatedUser.mockReset();
    mockListActiveOrganizationsForUser.mockReset();
    mockUpdateUserById.mockReset();
    mockProfileSelect.mockClear();
    mockProfileUpsert.mockClear();
    mockFrom.mockClear();

    mockMissingOnboardingColumns = true;
    mockStaleOnboardingConstraint = false;
    mockStoredProfile = {
      id: 'user-1',
      email: 'user@example.com',
      first_name: 'Lucas',
      last_name: 'North',
      full_name: 'Lucas North',
    };

    mockUpdateUserById.mockResolvedValue({ error: null });
  });

  it('persists status in auth metadata when profile onboarding columns are missing', async () => {
    const { setUserOnboardingStatus } = await import('@/lib/onboarding-server');
    const { supabaseAdmin } = await import('@/lib/supabase/server');

    await setUserOnboardingStatus({
      supabase: supabaseAdmin as any,
      user: user as any,
      status: 'profile_intro_pending',
      metadata: { workspaceId: 'org-1' },
    });

    expect(mockProfileUpsert).toHaveBeenCalledTimes(2);
    expect(mockProfileUpsert.mock.calls[0][0]).toEqual(expect.objectContaining({
      onboarding_status: 'profile_intro_pending',
      onboarding_metadata_json: expect.objectContaining({
        workspaceId: 'org-1',
        statusUpdatedAt: expect.any(String),
      }),
    }));
    expect(mockProfileUpsert.mock.calls[1][0]).not.toHaveProperty('onboarding_status');
    expect(mockProfileUpsert.mock.calls[1][0]).not.toHaveProperty('onboarding_metadata_json');
    expect(mockUpdateUserById).toHaveBeenCalledWith('user-1', {
      user_metadata: expect.objectContaining({
        onboarding_status: 'profile_intro_pending',
      }),
    });
  });

  it('does not treat onboarding check constraint errors as missing columns', async () => {
    const { isMissingProfileOnboardingColumn } = await import('@/lib/onboarding-server');

    expect(isMissingProfileOnboardingColumn({
      code: '23514',
      message: 'new row for relation "profiles" violates check constraint "profiles_onboarding_status_check"',
    })).toBe(false);
  });

  it('falls back to profile metadata and auth metadata when the onboarding status constraint is stale', async () => {
    const { setUserOnboardingStatus } = await import('@/lib/onboarding-server');
    const { supabaseAdmin } = await import('@/lib/supabase/server');

    mockMissingOnboardingColumns = false;
    mockStaleOnboardingConstraint = true;
    mockStoredProfile = {
      id: 'user-1',
      email: 'user@example.com',
      first_name: 'Lucas',
      last_name: 'North',
      full_name: 'Lucas North',
      onboarding_status: 'workspace_pending',
      onboarding_completed_at: null,
      onboarding_metadata_json: { source: 'test' },
    };

    await setUserOnboardingStatus({
      supabase: supabaseAdmin as any,
      user: user as any,
      status: 'profile_intro_pending',
      metadata: { workspaceSkippedAt: '2026-07-06T00:00:00.000Z' },
    });

    expect(mockProfileUpsert).toHaveBeenCalledTimes(2);
    expect(mockProfileUpsert.mock.calls[0][0]).toEqual(expect.objectContaining({
      onboarding_status: 'profile_intro_pending',
    }));
    expect(mockProfileUpsert.mock.calls[1][0]).not.toHaveProperty('onboarding_status');
    expect(mockProfileUpsert.mock.calls[1][0]).toEqual(expect.objectContaining({
      onboarding_metadata_json: expect.objectContaining({
        source: 'test',
        onboardingStatusOverride: 'profile_intro_pending',
        workspaceSkippedAt: '2026-07-06T00:00:00.000Z',
      }),
    }));
    expect(mockUpdateUserById).toHaveBeenCalledWith('user-1', {
      user_metadata: expect.objectContaining({
        onboarding_status: 'profile_intro_pending',
      }),
    });
  });

  it('uses auth metadata when the profile onboarding status is behind', async () => {
    const { getOnboardingState } = await import('@/lib/onboarding-server');
    const { supabaseAdmin } = await import('@/lib/supabase/server');

    mockMissingOnboardingColumns = false;
    mockStoredProfile = {
      id: 'user-1',
      email: 'user@example.com',
      first_name: 'Lucas',
      last_name: 'North',
      full_name: 'Lucas North',
      onboarding_status: 'workspace_pending',
      onboarding_completed_at: null,
      onboarding_metadata_json: {},
    };
    mockListActiveOrganizationsForUser.mockResolvedValue([]);

    const state = await getOnboardingState(supabaseAdmin as any, {
      ...user,
      user_metadata: { onboarding_status: 'profile_intro_pending' },
    } as any);

    expect(state.status).toBe('profile_intro_pending');
  });

  it('uses profile metadata status override when the status column is behind', async () => {
    const { getOnboardingState } = await import('@/lib/onboarding-server');
    const { supabaseAdmin } = await import('@/lib/supabase/server');

    mockMissingOnboardingColumns = false;
    mockStoredProfile = {
      id: 'user-1',
      email: 'user@example.com',
      first_name: 'Lucas',
      last_name: 'North',
      full_name: 'Lucas North',
      onboarding_status: 'workspace_pending',
      onboarding_completed_at: null,
      onboarding_metadata_json: { onboardingStatusOverride: 'profile_intro_pending' },
    };
    mockListActiveOrganizationsForUser.mockResolvedValue([]);

    const state = await getOnboardingState(supabaseAdmin as any, {
      ...user,
      user_metadata: { onboarding_status: 'workspace_pending' },
    } as any);

    expect(state.status).toBe('profile_intro_pending');
  });
});
