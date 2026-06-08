import {
  agencyFaqs,
  agencyNavLinks,
  agencyOffers,
  agencyPositioning,
  agencyPublicRoutes,
  agencyWhoFor,
  agencyWhoNotFor,
} from '@/lib/public-agency-content';

describe('public agency website content', () => {
  it('defines service-first positioning separate from SaaS signup', () => {
    expect(agencyPositioning.headline).toContain('calls, meetings, and customer conversations');
    expect(agencyPositioning.reassurance).toContain('managed service');
    expect(agencyPositioning.reassurance).not.toContain('subscribe');
    expect(agencyPositioning.reassurance).not.toContain('credits');
  });

  it('defines public routes and nav without internal dashboard links', () => {
    expect(agencyPublicRoutes).toEqual(expect.arrayContaining([
      '/agency',
      '/agency/services',
      '/agency/process',
      '/agency/packages',
      '/agency/contact',
    ]));
    for (const link of agencyNavLinks) {
      expect(link.href).toMatch(/^\/agency/);
      expect(link.href).not.toContain('/dashboard');
      expect(link.href).not.toContain('/api/agency');
    }
  });

  it('defines the required service packages with intake CTAs', () => {
    expect(agencyOffers.map((offer) => offer.id)).toEqual([
      'content-operations-setup',
      'monthly-founder-content',
      'customer-communication-system',
      'custom-startup-ops',
    ]);
    for (const offer of agencyOffers) {
      expect(offer.href).toContain('/agency/contact');
      expect(offer.includes.length).toBeGreaterThanOrEqual(5);
      expect(offer.outcome).not.toContain('software subscription');
    }
  });

  it('includes conversion FAQ and fit guidance without internal implementation details', () => {
    expect(agencyFaqs.map((faq) => faq.question)).toEqual(expect.arrayContaining([
      'Do clients get software access?',
      'Can you work from Slack or meeting notes?',
      'Do you post for us automatically?',
      'How is this different from a generic AI tool?',
    ]));
    expect(agencyWhoFor.length).toBeGreaterThanOrEqual(4);
    expect(agencyWhoNotFor.length).toBeGreaterThanOrEqual(4);
    expect(JSON.stringify({ agencyFaqs, agencyWhoFor, agencyWhoNotFor })).not.toContain('client_integrations');
    expect(JSON.stringify({ agencyFaqs, agencyWhoFor, agencyWhoNotFor })).not.toContain('source_imports');
    expect(JSON.stringify({ agencyFaqs, agencyWhoFor, agencyWhoNotFor })).not.toContain('/dashboard/agency');
  });
});
