import { resolveTranscribeRequestAuthContext } from '@/lib/api/transcribe-auth';

const isAuthorizedMaintenanceRequestMock = jest.fn();
const requireProjectOwnerMock = jest.fn();
const fromMock = jest.fn();

jest.mock('@/lib/maintenance-auth', () => ({
  isAuthorizedMaintenanceRequest: (...args: any[]) => isAuthorizedMaintenanceRequestMock(...args),
}));

jest.mock('@/lib/api/route-auth', () => ({
  RouteAccessError: class RouteAccessError extends Error {
    status: number;
    constructor(status: number, message: string) {
      super(message);
      this.status = status;
    }
  },
  requireProjectOwner: (...args: any[]) => requireProjectOwnerMock(...args),
}));

jest.mock('@/lib/supabase/server', () => ({
  supabaseAdmin: {
    from: (...args: any[]) => fromMock(...args),
  },
}));

function requestStub() {
  return { headers: new Headers() } as any;
}

describe('resolveTranscribeRequestAuthContext', () => {
  beforeEach(() => {
    isAuthorizedMaintenanceRequestMock.mockReset();
    requireProjectOwnerMock.mockReset();
    fromMock.mockReset();
  });

  it('uses project-owner helper for user-triggered requests (legacy owner)', async () => {
    isAuthorizedMaintenanceRequestMock.mockReturnValue(false);
    requireProjectOwnerMock.mockResolvedValue({
      user: { id: 'user-1' },
      project: { id: 'project-1', user_id: 'user-1', transcription_text: null },
      accessMode: 'legacy_owner',
    });

    const result = await resolveTranscribeRequestAuthContext(requestStub(), 'project-1');
    expect(result.isInternal).toBe(false);
    expect(result.callerUserId).toBe('user-1');
    expect(result.existingProject.user_id).toBe('user-1');
    expect(requireProjectOwnerMock).toHaveBeenCalledTimes(1);
  });

  it('uses project-owner helper for user-triggered requests (organization member)', async () => {
    isAuthorizedMaintenanceRequestMock.mockReturnValue(false);
    requireProjectOwnerMock.mockResolvedValue({
      user: { id: 'member-1' },
      project: { id: 'project-2', user_id: 'owner-1', organization_id: 'org-1' },
      accessMode: 'organization_member',
    });

    const result = await resolveTranscribeRequestAuthContext(requestStub(), 'project-2');
    expect(result.isInternal).toBe(false);
    expect(result.callerUserId).toBe('member-1');
    expect(result.existingProject.organization_id).toBe('org-1');
  });

  it('propagates non-member denial from project-owner helper', async () => {
    const { RouteAccessError } = await import('@/lib/api/route-auth');
    isAuthorizedMaintenanceRequestMock.mockReturnValue(false);
    requireProjectOwnerMock.mockRejectedValue(new RouteAccessError(403, 'Forbidden'));

    await expect(resolveTranscribeRequestAuthContext(requestStub(), 'project-3')).rejects.toEqual(
      expect.objectContaining({ status: 403, message: 'Forbidden' })
    );
  });

  it('supports internal authorized path without end-user auth helper', async () => {
    isAuthorizedMaintenanceRequestMock.mockReturnValue(true);
    fromMock.mockReturnValue({
      select: () => ({
        eq: () => ({
          single: async () => ({
            data: {
              id: 'project-4',
              user_id: 'owner-4',
              transcription_text: null,
            },
            error: null,
          }),
        }),
      }),
    });

    const result = await resolveTranscribeRequestAuthContext(requestStub(), 'project-4');
    expect(result.isInternal).toBe(true);
    expect(result.callerUserId).toBeNull();
    expect(result.existingProject.user_id).toBe('owner-4');
    expect(requireProjectOwnerMock).not.toHaveBeenCalled();
  });
});
