const mockCreateAgencyFunnelEvent = jest.fn();
const mockCheckAgencyFunnelEventRateLimit = jest.fn();

jest.mock('@/lib/agency-funnel-events', () => {
  const actual = jest.requireActual('@/lib/agency-funnel-events');
  return {
    ...actual,
    checkAgencyFunnelEventRateLimit: (...args: any[]) => mockCheckAgencyFunnelEventRateLimit(...args),
    createAgencyFunnelEvent: (...args: any[]) => mockCreateAgencyFunnelEvent(...args),
  };
});

jest.mock('@/lib/supabase/server', () => ({
  supabaseAdmin: { from: jest.fn() },
}));

describe('agency funnel event route', () => {
  beforeEach(() => {
    jest.resetModules();
    mockCreateAgencyFunnelEvent.mockReset();
    mockCheckAgencyFunnelEventRateLimit.mockReset();
    mockCheckAgencyFunnelEventRateLimit.mockReturnValue({
      allowed: true,
      remaining: 119,
      retryAfterSeconds: 0,
    });
    mockCreateAgencyFunnelEvent.mockResolvedValue({
      event_name: 'agency_page_view',
    });
  });

  it('stores allowed public funnel events without returning records', async () => {
    const { POST } = await import('@/app/api/agency-funnel-events/route');

    const response = await POST(new Request('http://localhost/api/agency-funnel-events', {
      method: 'POST',
      headers: { 'x-forwarded-for': '127.0.0.1' },
      body: JSON.stringify({
        eventName: 'agency_page_view',
        anonymousId: 'anon-1',
        path: '/agency',
        metadata: {
          email: 'lead@example.com',
          source: 'public_agency_site',
        },
      }),
    }) as any);
    const payload = await response.json();

    expect(response.status).toBe(201);
    expect(payload).toEqual({ success: true });
    expect(mockCheckAgencyFunnelEventRateLimit).toHaveBeenCalledWith('127.0.0.1');
    expect(mockCreateAgencyFunnelEvent).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      eventName: 'agency_page_view',
      anonymousId: 'anon-1',
    }));
  });

  it('rejects disallowed event names', async () => {
    const { POST } = await import('@/app/api/agency-funnel-events/route');
    const { AgencyFunnelEventValidationError } = jest.requireActual('@/lib/agency-funnel-events');
    mockCreateAgencyFunnelEvent.mockImplementation(() => {
      throw new AgencyFunnelEventValidationError('Unsupported agency funnel event');
    });

    const response = await POST(new Request('http://localhost/api/agency-funnel-events', {
      method: 'POST',
      body: JSON.stringify({
        eventName: 'unknown_event',
      }),
    }) as any);
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.error).toBe('Unsupported agency funnel event');
  });

  it('rate limits public event writes', async () => {
    const { POST } = await import('@/app/api/agency-funnel-events/route');
    mockCheckAgencyFunnelEventRateLimit.mockReturnValue({
      allowed: false,
      remaining: 0,
      retryAfterSeconds: 60,
    });

    const response = await POST(new Request('http://localhost/api/agency-funnel-events', {
      method: 'POST',
      body: JSON.stringify({
        eventName: 'agency_page_view',
      }),
    }) as any);
    const payload = await response.json();

    expect(response.status).toBe(429);
    expect(payload.retryAfterSeconds).toBe(60);
    expect(mockCreateAgencyFunnelEvent).not.toHaveBeenCalled();
  });

  it('does not expose public event reads', async () => {
    const { GET } = await import('@/app/api/agency-funnel-events/route');

    const response = await GET();
    const payload = await response.json();

    expect(response.status).toBe(405);
    expect(payload).toEqual({ error: 'Method not allowed' });
  });
});
