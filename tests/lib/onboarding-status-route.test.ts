const mockRequireAuthenticatedUser = jest.fn();
const mockGetOnboardingState = jest.fn();
const mockSetUserOnboardingStatus = jest.fn();
const mockMarkWorkspaceOnboardingComplete = jest.fn();
const mockGetUserById = jest.fn();

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

jest.mock('@/lib/onboarding-server', () => ({
  getOnboardingState: (...args: any[]) => mockGetOnboardingState(...args),
  markWorkspaceOnboardingComplete: (...args: any[]) => mockMarkWorkspaceOnboardingComplete(...args),
  setUserOnboardingStatus: (...args: any[]) => mockSetUserOnboardingStatus(...args),
}));

jest.mock('@/lib/supabase/server', () => ({
  supabaseAdmin: {
    auth: {
      admin: {
        getUserById: (...args: any[]) => mockGetUserById(...args),
      },
    },
  },
}));

const user = { id: 'user-1', email: 'user@example.com' };
const refreshedUser = { ...user, user_metadata: { onboarding_status: 'profile_intro_pending' } };

const baseState = {
  status: 'workspace_pending',
  stepIndex: 2,
  totalSteps: 6,
  profile: {
    firstName: 'Lucas',
    lastName: 'North',
    fullName: 'Lucas North',
    email: 'user@example.com',
  },
  workspace: null,
};

const buildPatchRequest = (body: Record<string, unknown>) =>
  new Request('http://localhost/api/onboarding/status', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

describe('PATCH /api/onboarding/status', () => {
  beforeEach(() => {
    mockRequireAuthenticatedUser.mockReset();
    mockGetOnboardingState.mockReset();
    mockSetUserOnboardingStatus.mockReset();
    mockMarkWorkspaceOnboardingComplete.mockReset();
    mockGetUserById.mockReset();

    mockRequireAuthenticatedUser.mockResolvedValue(user);
    mockSetUserOnboardingStatus.mockResolvedValue(undefined);
    mockMarkWorkspaceOnboardingComplete.mockResolvedValue(undefined);
    mockGetUserById.mockResolvedValue({ data: { user: refreshedUser }, error: null });
  });

  it('blocks bypassing the required account profile step', async () => {
    mockGetOnboardingState.mockResolvedValue({
      ...baseState,
      status: 'profile_pending',
      stepIndex: 1,
    });
    const { PATCH } = await import('@/app/api/onboarding/status/route');

    const response = await PATCH(buildPatchRequest({
      status: 'workspace_pending',
      skipped: true,
    }) as any);
    const payload = await response.json();

    expect(response.status).toBe(409);
    expect(payload.error).toBe('Complete your account profile before continuing onboarding');
    expect(mockSetUserOnboardingStatus).not.toHaveBeenCalled();
  });

  it('allows skipping optional workspace setup and records metadata', async () => {
    mockGetOnboardingState
      .mockResolvedValueOnce(baseState)
      .mockResolvedValueOnce({
        ...baseState,
        status: 'profile_intro_pending',
        stepIndex: 3,
      });
    const { PATCH } = await import('@/app/api/onboarding/status/route');

    const response = await PATCH(buildPatchRequest({
      status: 'profile_intro_pending',
      skipped: true,
      metadata: { workspaceSkippedAt: '2026-07-06T00:00:00.000Z' },
    }) as any);
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.status).toBe('profile_intro_pending');
    expect(mockSetUserOnboardingStatus).toHaveBeenCalledWith(expect.objectContaining({
      user,
      status: 'profile_intro_pending',
      metadata: expect.objectContaining({
        lastClientStatus: 'workspace_pending',
        skippedTutorial: true,
        workspaceSkippedAt: '2026-07-06T00:00:00.000Z',
      }),
    }));
    expect(mockGetUserById).toHaveBeenCalledWith('user-1');
    expect(mockGetOnboardingState.mock.calls[1][1]).toBe(refreshedUser);
  });

  it('marks workspace onboarding complete when the tour completes', async () => {
    const stateWithWorkspace = {
      ...baseState,
      status: 'upload_intro_pending',
      stepIndex: 6,
      workspace: {
        id: 'org-1',
        name: 'Acme Workspace',
        type: 'saas_customer',
      },
    };
    mockGetOnboardingState
      .mockResolvedValueOnce(stateWithWorkspace)
      .mockResolvedValueOnce({
        ...stateWithWorkspace,
        status: 'complete',
      });
    const { PATCH } = await import('@/app/api/onboarding/status/route');

    const response = await PATCH(buildPatchRequest({
      status: 'complete',
      skipped: false,
    }) as any);

    expect(response.status).toBe(200);
    expect(mockMarkWorkspaceOnboardingComplete).toHaveBeenCalledWith(expect.objectContaining({
      workspaceId: 'org-1',
      skipped: false,
    }));
  });
});
