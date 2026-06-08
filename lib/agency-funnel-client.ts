"use client";

import type { AgencyFunnelEventName } from '@/lib/agency-funnel-events';

type ClientFunnelEventInput = {
  leadId?: string | null;
  metadata?: Record<string, string | number | boolean | null | undefined>;
  path?: string | null;
};

const ANONYMOUS_ID_KEY = 'audiorepurpose_agency_funnel_id';

function anonymousId(): string | null {
  if (typeof window === 'undefined') return null;

  try {
    const existing = window.localStorage.getItem(ANONYMOUS_ID_KEY);
    if (existing) return existing;

    const next = typeof window.crypto?.randomUUID === 'function'
      ? window.crypto.randomUUID()
      : `anon_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    window.localStorage.setItem(ANONYMOUS_ID_KEY, next);
    return next;
  } catch {
    return null;
  }
}

function utmParams(searchParams: URLSearchParams) {
  return {
    utmSource: searchParams.get('utm_source'),
    utmMedium: searchParams.get('utm_medium'),
    utmCampaign: searchParams.get('utm_campaign'),
    utmContent: searchParams.get('utm_content'),
    utmTerm: searchParams.get('utm_term'),
  };
}

export function trackAgencyFunnelEvent(
  eventName: AgencyFunnelEventName,
  input: ClientFunnelEventInput = {}
) {
  if (typeof window === 'undefined') return;

  try {
    const url = new URL(window.location.href);
    const payload = {
      eventName,
      anonymousId: anonymousId(),
      leadId: input.leadId || null,
      path: input.path || `${url.pathname}${url.search}`,
      referrer: document.referrer || null,
      ...utmParams(url.searchParams),
      metadata: input.metadata || {},
    };
    const body = JSON.stringify(payload);

    if (navigator.sendBeacon) {
      const blob = new Blob([body], { type: 'application/json' });
      if (navigator.sendBeacon('/api/agency-funnel-events', blob)) return;
    }

    void fetch('/api/agency-funnel-events', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body,
      keepalive: true,
    }).catch(() => {});
  } catch {
    // Funnel tracking should never affect the public experience.
  }
}
