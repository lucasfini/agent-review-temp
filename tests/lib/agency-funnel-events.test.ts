import {
  AgencyFunnelEventValidationError,
  checkAgencyFunnelEventRateLimit,
  createAgencyFunnelEvent,
  normalizeAgencyFunnelEvent,
  resetAgencyFunnelEventRateLimitForTests,
  sanitizeAgencyFunnelMetadata,
} from '@/lib/agency-funnel-events';

describe('agency funnel event helpers', () => {
  beforeEach(() => {
    resetAgencyFunnelEventRateLimitForTests();
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

  it('rate limits repeated public event submissions by identifier', () => {
    for (let index = 0; index < 120; index += 1) {
      expect(checkAgencyFunnelEventRateLimit('127.0.0.1', 1_000).allowed).toBe(true);
    }

    const denied = checkAgencyFunnelEventRateLimit('127.0.0.1', 1_000);
    expect(denied.allowed).toBe(false);
    expect(denied.retryAfterSeconds).toBeGreaterThan(0);
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
