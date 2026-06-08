"use client";

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';

import { trackAgencyFunnelEvent } from '@/lib/agency-funnel-client';

function labelFor(anchor: HTMLAnchorElement): string {
  return (anchor.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 120);
}

export default function AgencyFunnelTracker() {
  const pathname = usePathname();

  useEffect(() => {
    if (!pathname?.startsWith('/agency')) return;

    trackAgencyFunnelEvent('agency_page_view', { path: window.location.pathname + window.location.search });
    if (pathname === '/agency/contact') {
      trackAgencyFunnelEvent('agency_intake_view', { path: window.location.pathname + window.location.search });
    }
    if (pathname === '/agency/thank-you') {
      trackAgencyFunnelEvent('agency_thank_you_view', { path: window.location.pathname + window.location.search });
    }
  }, [pathname]);

  useEffect(() => {
    const handleClick = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const anchor = target.closest('a[href]');
      if (!(anchor instanceof HTMLAnchorElement)) return;

      const href = anchor.getAttribute('href') || '';
      if (!href.includes('/agency/contact')) return;

      trackAgencyFunnelEvent('agency_cta_click', {
        metadata: {
          ctaHref: href,
          ctaLabel: labelFor(anchor),
          source: 'public_agency_site',
        },
      });
    };

    document.addEventListener('click', handleClick, true);
    return () => document.removeEventListener('click', handleClick, true);
  }, []);

  return null;
}
