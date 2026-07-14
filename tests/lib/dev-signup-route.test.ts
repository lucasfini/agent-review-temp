const mockCreateUser = jest.fn();
const mockSignInWithPassword = jest.fn();
const mockCreateSupabaseClient = jest.fn((url: string, key: string) => {
  if (key === 'service-role-key') {
    return {
      auth: {
        admin: {
          createUser: (...args: any[]) => mockCreateUser(...args),
        },
      },
    };
  }

  return {
    auth: {
      signInWithPassword: (...args: any[]) => mockSignInWithPassword(...args),
    },
  };
});

jest.mock('@supabase/supabase-js', () => ({
  createClient: (...args: any[]) => mockCreateSupabaseClient(...args),
}));

const originalEnv = {
  nodeEnv: process.env.NODE_ENV,
  enableDevConfirmedSignup: process.env.ENABLE_DEV_CONFIRMED_SIGNUP,
  publicEnableDevConfirmedSignup: process.env.NEXT_PUBLIC_ENABLE_DEV_CONFIRMED_SIGNUP,
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
  supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
};

const buildRequest = (body: Record<string, unknown>) =>
  new Request('http://localhost/api/auth/dev-signup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

const restoreEnv = (key: keyof NodeJS.ProcessEnv, value: string | undefined) => {
  if (typeof value === 'undefined') {
    delete process.env[key];
    return;
  }

  process.env[key] = value;
};

describe('POST /api/auth/dev-signup', () => {
  beforeEach(() => {
    mockCreateUser.mockReset();
    mockSignInWithPassword.mockReset();
    mockCreateSupabaseClient.mockClear();

    process.env.NODE_ENV = 'test';
    process.env.ENABLE_DEV_CONFIRMED_SIGNUP = 'true';
    process.env.NEXT_PUBLIC_ENABLE_DEV_CONFIRMED_SIGNUP = 'true';
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-key';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key';
  });

  afterAll(() => {
    restoreEnv('NODE_ENV', originalEnv.nodeEnv);
    restoreEnv('ENABLE_DEV_CONFIRMED_SIGNUP', originalEnv.enableDevConfirmedSignup);
    restoreEnv('NEXT_PUBLIC_ENABLE_DEV_CONFIRMED_SIGNUP', originalEnv.publicEnableDevConfirmedSignup);
    restoreEnv('NEXT_PUBLIC_SUPABASE_URL', originalEnv.supabaseUrl);
    restoreEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', originalEnv.supabaseAnonKey);
    restoreEnv('SUPABASE_SERVICE_ROLE_KEY', originalEnv.supabaseServiceRoleKey);
  });

  it('is unavailable when the dev flag is disabled', async () => {
    process.env.ENABLE_DEV_CONFIRMED_SIGNUP = 'false';
    process.env.NEXT_PUBLIC_ENABLE_DEV_CONFIRMED_SIGNUP = 'false';
    const { POST } = await import('@/app/api/auth/dev-signup/route');

    const response = await POST(buildRequest({
      email: 'new@example.com',
      password: 'password123',
    }));

    expect(response.status).toBe(404);
    expect(mockCreateUser).not.toHaveBeenCalled();
  });

  it('stays unavailable in production', async () => {
    process.env.NODE_ENV = 'production';
    const { POST } = await import('@/app/api/auth/dev-signup/route');

    const response = await POST(buildRequest({
      email: 'new@example.com',
      password: 'password123',
    }));

    expect(response.status).toBe(404);
    expect(mockCreateUser).not.toHaveBeenCalled();
  });

  it('creates a confirmed user and returns a session for local testing', async () => {
    mockCreateUser.mockResolvedValue({
      data: { user: { id: 'user-1', email: 'new@example.com' } },
      error: null,
    });
    mockSignInWithPassword.mockResolvedValue({
      data: {
        user: { id: 'user-1', email: 'new@example.com' },
        session: {
          access_token: 'access-token',
          refresh_token: 'refresh-token',
        },
      },
      error: null,
    });
    const { POST } = await import('@/app/api/auth/dev-signup/route');

    const response = await POST(buildRequest({
      email: ' new@example.com ',
      password: 'password123',
      name: 'Test User',
    }));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(mockCreateUser).toHaveBeenCalledWith(expect.objectContaining({
      email: 'new@example.com',
      password: 'password123',
      email_confirm: true,
      user_metadata: expect.objectContaining({
        full_name: 'Test User',
        onboarding_status: 'profile_pending',
      }),
    }));
    expect(mockSignInWithPassword).toHaveBeenCalledWith({
      email: 'new@example.com',
      password: 'password123',
    });
    expect(payload.session.access_token).toBe('access-token');
  });
});
