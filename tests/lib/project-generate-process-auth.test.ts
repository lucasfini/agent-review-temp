import { POST } from '@/app/api/projects/[id]/generate/process/route';

const requireProjectOwnerMock = jest.fn();
const getUserMock = jest.fn();

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

jest.mock('@/lib/maintenance-auth', () => ({
  isAuthorizedMaintenanceRequest: () => false,
}));

jest.mock('@/lib/supabase/server', () => ({
  supabaseAdmin: {
    auth: {
      getUser: (...args: any[]) => getUserMock(...args),
    },
  },
}));

describe('project generate/process auth cutover', () => {
  beforeEach(() => {
    requireProjectOwnerMock.mockReset();
    getUserMock.mockReset();
    getUserMock.mockResolvedValue({
      data: { user: { id: 'user-1' } },
      error: null,
    });
  });

  it('returns helper auth status when non-member is denied', async () => {
    const { RouteAccessError } = await import('@/lib/api/route-auth');
    requireProjectOwnerMock.mockRejectedValueOnce(new RouteAccessError(403, 'Forbidden'));

    const request = new Request('http://localhost/api/projects/p1/generate/process', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer token',
      },
    });

    const response = await POST(request as any, { params: Promise.resolve({ id: 'p1' }) });
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: 'Forbidden' });
    expect(requireProjectOwnerMock).toHaveBeenCalledTimes(1);
  });
});
