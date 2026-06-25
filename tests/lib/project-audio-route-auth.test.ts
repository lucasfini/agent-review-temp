import { DELETE } from '@/app/api/projects/[id]/audio/route';

const requireProjectOwnerMock = jest.fn();
const r2SendMock = jest.fn();
const updateEqMock = jest.fn();
const updateIsMock = jest.fn();
const updateMock = jest.fn(() => ({
  eq: updateEqMock,
}));

updateEqMock.mockImplementation(() => ({
  is: updateIsMock,
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

jest.mock('@/lib/r2', () => ({
  BUCKET_NAME: 'test-bucket',
  r2Client: {
    send: (...args: any[]) => r2SendMock(...args),
  },
}));

jest.mock('@/lib/supabase/server', () => ({
  supabaseAdmin: {
    from: jest.fn(() => ({
      update: updateMock,
    })),
  },
}));

function params(id: string): Promise<{ id: string }> {
  return Promise.resolve({ id });
}

describe('project audio route auth cutover', () => {
  beforeEach(() => {
    requireProjectOwnerMock.mockReset();
    r2SendMock.mockReset();
    updateEqMock.mockClear();
    updateIsMock.mockClear();
  });

  it('returns helper auth status when access is denied', async () => {
    const { RouteAccessError } = await import('@/lib/api/route-auth');
    requireProjectOwnerMock.mockRejectedValueOnce(new RouteAccessError(403, 'Forbidden'));

    const response = await DELETE(new Request('http://localhost') as any, { params: params('proj-1') });
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: 'Forbidden' });
  });

  it('deletes audio when authorized project has an audio file', async () => {
    requireProjectOwnerMock.mockResolvedValueOnce({
      user: { id: 'user-1' },
      project: {
        id: 'proj-1',
        user_id: 'owner-1',
        organization_id: 'org-1',
        audio_file_name: 'audio.mp3',
      },
      accessMode: 'organization_member',
    });
    r2SendMock.mockResolvedValueOnce({});

    const response = await DELETE(new Request('http://localhost') as any, { params: params('proj-1') });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ success: true });
    expect(r2SendMock).toHaveBeenCalledTimes(1);
    expect(updateMock).toHaveBeenCalledTimes(1);
    expect(updateEqMock).toHaveBeenCalledWith('id', 'proj-1');
  });
});
