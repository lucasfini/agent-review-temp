import { requireProjectOwner, RouteAccessError } from '@/lib/api/route-auth';

let mockUser: { id: string; email?: string } | null = null;
let mockProject: Record<string, any> | null = null;
let mockProjectError: any = null;
let mockHasMembership = false;
let mockMembershipError: any = null;
let lastProjectSelect = '';

const fromMock = jest.fn((table: string) => {
  if (table === 'projects') {
    return {
      select: jest.fn((select: string) => {
        lastProjectSelect = select;
        return {
          eq: jest.fn(() => ({
            single: jest.fn(async () => ({
              data: mockProject,
              error: mockProjectError,
            })),
          })),
        };
      }),
    };
  }

  if (table === 'organization_members') {
    const query: any = {
      select: jest.fn(() => query),
      eq: jest.fn(() => query),
      maybeSingle: jest.fn(async () => ({
        data: mockHasMembership ? { id: 'mem-1' } : null,
        error: mockMembershipError,
      })),
    };
    return query;
  }

  throw new Error(`Unexpected table in mock: ${table}`);
});

const getUserMock = jest.fn(async () => ({
  data: { user: mockUser },
  error: mockUser ? null : { message: 'Unauthorized' },
}));

jest.mock('@/lib/supabase/server', () => ({
  supabaseAdmin: {
    auth: {
      getUser: (...args: any[]) => getUserMock(...args),
    },
    from: (...args: any[]) => fromMock(...args),
  },
}));

jest.mock('@supabase/ssr', () => ({
  createServerClient: jest.fn(),
}));

function buildRequest() {
  return {
    headers: new Headers({ authorization: 'Bearer test-token' }),
    cookies: {
      get: jest.fn(),
    },
  } as any;
}

describe('requireProjectOwner org-aware access', () => {
  beforeEach(() => {
    mockUser = { id: 'user-1', email: 'user@example.com' };
    mockProject = null;
    mockProjectError = null;
    mockHasMembership = false;
    mockMembershipError = null;
    lastProjectSelect = '';
    fromMock.mockClear();
    getUserMock.mockClear();
  });

  it('allows legacy project owner access', async () => {
    mockProject = {
      id: 'project-1',
      user_id: 'user-1',
      organization_id: null,
    };

    const result = await requireProjectOwner(buildRequest(), 'project-1', 'speaker_data');
    expect(result.user.id).toBe('user-1');
    expect(result.project.id).toBe('project-1');
    expect(result.accessMode).toBe('legacy_owner');
    expect(lastProjectSelect).toContain('user_id');
    expect(lastProjectSelect).toContain('organization_id');
  });

  it('allows active organization member access when not legacy owner', async () => {
    mockProject = {
      id: 'project-2',
      user_id: 'project-owner',
      organization_id: 'org-1',
    };
    mockHasMembership = true;

    const result = await requireProjectOwner(buildRequest(), 'project-2');
    expect(result.user.id).toBe('user-1');
    expect(result.project.id).toBe('project-2');
    expect(result.accessMode).toBe('organization_member');
  });

  it('denies access when user is neither owner nor active org member', async () => {
    mockProject = {
      id: 'project-3',
      user_id: 'project-owner',
      organization_id: 'org-1',
    };
    mockHasMembership = false;

    await expect(requireProjectOwner(buildRequest(), 'project-3')).rejects.toEqual(
      expect.objectContaining({
        status: 403,
        message: 'Forbidden',
      })
    );
  });

  it('denies non-owner access when project organization_id is null', async () => {
    mockProject = {
      id: 'project-4',
      user_id: 'project-owner',
      organization_id: null,
    };

    await expect(requireProjectOwner(buildRequest(), 'project-4')).rejects.toEqual(
      expect.objectContaining<RouteAccessError>({
        status: 403,
        message: 'Forbidden',
      })
    );
  });
});
