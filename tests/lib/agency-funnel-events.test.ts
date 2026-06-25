import {
  AgencyFunnelEventValidationError,
  buildAgencyFunnelEventRateLimitKey,
  checkAgencyFunnelEventRateLimit,
  createAgencyFunnelEvent,
  normalizeAgencyFunnelEvent,
  resetAgencyFunnelEventRateLimitForTests,
  sanitizeAgencyFunnelMetadata,
  setAgencyFunnelEventDurableLimiterForTests,
} from '@/lib/agency-funnel-events';

describe('agency funnel event helpers', () => {
  beforeEach(() => {
    resetAgencyFunnelEventRateLimitForTests();
    setAgencyFunnelEventDurableLimiterForTests(null);
  });

  it('normalizes allowed public funnel events', () => {
    const event = normalizeAgencyFunnelEvent({
      eventName: 'agency_cta_click',
      anonymousId: 'anon-1',
      path: '/agency?utm_source=launch',
      referrer: 'https://example.com',
      utmSource: 'launch',
      metadata: {
        ctaHref: '/agency/contact',
        ctaLabel: 'Start intake',
        email: 'lead@example.com',
      },
    });

    expect(event).toEqual(expect.objectContaining({
      event_name: 'agency_cta_click',
      anonymous_id: 'anon-1',
      path: '/agency?utm_source=launch',
      referrer: 'https://example.com',
      utm_source: 'launch',
      metadata_json: {
        ctaHref: '/agency/contact',
        ctaLabel: 'Start intake',
      },
    }));
  });

  it('rejects unsupported events and invalid payload shapes', () => {
    expect(() => normalizeAgencyFunnelEvent({ eventName: 'unknown_event' }))
      .toThrow(AgencyFunnelEventValidationError);
    expect(() => normalizeAgencyFunnelEvent({
      eventName: 'agency_page_view',
      metadata: [],
    })).toThrow('metadata must be an object');
  });

  it('strips PII-like and unsupported metadata fields', () => {
    const metadata = sanitizeAgencyFunnelMetadata({
      ctaHref: '/agency/contact',
      ctaLabel: 'Start intake',
      company: 'Acme',
      message: 'Need help',
      website: 'https://example.com',
      unknown: 'ignored',
      source: 'public_agency_site',
    });

    expect(metadata).toEqual({
      ctaHref: '/agency/contact',
      ctaLabel: 'Start intake',
      source: 'public_agency_site',
    });
  });

  it('rate limits repeated public event submissions by identifier', async () => {
    for (let index = 0; index < 120; index += 1) {
      const result = await checkAgencyFunnelEventRateLimit('127.0.0.1', 1_000);
      expect(result.allowed).toBe(true);
      expect(result.backend).toBe('memory');
    }

    const denied = await checkAgencyFunnelEventRateLimit('127.0.0.1', 1_000);
    expect(denied.allowed).toBe(false);
    expect(denied.retryAfterSeconds).toBeGreaterThan(0);
  });

  it('uses durable funnel event limiter results when configured', async () => {
    const limiter = {
      limit: jest.fn().mockResolvedValue({
        success: false,
        limit: 120,
        remaining: 0,
        reset: 61_000,
      }),
    };
    setAgencyFunnelEventDurableLimiterForTests(limiter);

    const result = await checkAgencyFunnelEventRateLimit('127.0.0.1', 1_000);

    expect(result).toEqual(expect.objectContaining({
      allowed: false,
      backend: 'upstash',
      degraded: false,
      retryAfterSeconds: 60,
    }));
    expect(limiter.limit).toHaveBeenCalledWith(buildAgencyFunnelEventRateLimitKey('127.0.0.1'));
  });

  it('falls back gracefully when durable funnel event rate limiting fails', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const limiter = {
      limit: jest.fn().mockRejectedValue(new Error('redis unavailable')),
    };
    setAgencyFunnelEventDurableLimiterForTests(limiter);

    const result = await checkAgencyFunnelEventRateLimit('127.0.0.1', 1_000);

    expect(result.allowed).toBe(true);
    expect(result.backend).toBe('memory');
    expect(result.degraded).toBe(true);
    warnSpy.mockRestore();
  });

  it('hashes funnel event rate limit keys instead of exposing raw IP values', () => {
    const key = buildAgencyFunnelEventRateLimitKey('127.0.0.1');

    expect(key).toMatch(/^agency-funnel-event:[a-f0-9]{32}$/);
    expect(key).not.toContain('127.0.0.1');
  });

  it('inserts sanitized events into the private funnel event table', async () => {
    const insert = jest.fn().mockResolvedValue({ error: null });
    const from = jest.fn(() => ({ insert }));
    const supabase = { from };

    const payload = await createAgencyFunnelEvent(supabase as any, {
      eventName: 'agency_intake_submitted',
      leadId: '11111111-1111-4111-8111-111111111111',
      metadata: {
        formId: 'agency_lead_form',
        email: 'lead@example.com',
      },
    });

    expect(from).toHaveBeenCalledWith('agency_funnel_events');
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({
      event_name: 'agency_intake_submitted',
      lead_id: '11111111-1111-4111-8111-111111111111',
      metadata_json: {
        formId: 'agency_lead_form',
      },
    }));
    expect(payload).toEqual(expect.objectContaining({
      event_name: 'agency_intake_submitted',
    }));
  });
});
