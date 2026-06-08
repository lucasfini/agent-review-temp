import {
  AgencyLeadValidationError,
  buildAgencyClientInputFromLead,
  checkAgencyLeadRateLimit,
  normalizeAgencyLeadSubmission,
  resetAgencyLeadRateLimitForTests,
  type AgencyLead,
} from '@/lib/agency-leads';

const baseLead: AgencyLead = {
  id: 'lead-1',
  name: 'Lucas',
  email: 'lucas@example.com',
  company: 'Acme',
  website: 'https://example.com',
  role: 'Founder',
  packageInterest: 'monthly-founder-content',
  budgetRange: '$5k-$10k/mo',
  timeline: 'This quarter',
  message: 'We need to turn customer calls into founder content.',
  source: 'agency_website',
  status: 'qualified',
  metadata: {},
  convertedClientId: null,
  convertedAt: null,
  convertedBy: null,
  createdAt: '2026-06-08T00:00:00.000Z',
  updatedAt: '2026-06-08T00:00:00.000Z',
};

describe('agency lead helpers', () => {
  beforeEach(() => {
    resetAgencyLeadRateLimitForTests();
  });

  it('normalizes valid public lead submissions', () => {
    const payload = normalizeAgencyLeadSubmission({
      name: ' Lucas ',
      email: ' LUCAS@EXAMPLE.COM ',
      company: ' Acme ',
      packageInterest: 'monthly-founder-content',
      message: ' Need help ',
      metadata: { page: '/agency/contact' },
    });

    expect(payload).toEqual(expect.objectContaining({
      name: 'Lucas',
      email: 'lucas@example.com',
      company: 'Acme',
      package_interest: 'monthly-founder-content',
      message: 'Need help',
      source: 'agency_website',
      status: 'new',
      metadata_json: { page: '/agency/contact' },
    }));
  });

  it('rejects invalid email, long fields, and honeypot submissions', () => {
    expect(() => normalizeAgencyLeadSubmission({ email: 'not-an-email' }))
      .toThrow(AgencyLeadValidationError);
    expect(() => normalizeAgencyLeadSubmission({
      email: 'lucas@example.com',
      message: 'x'.repeat(5001),
    })).toThrow('message must be 5000 characters or fewer');
    expect(() => normalizeAgencyLeadSubmission({
      email: 'lucas@example.com',
      referralCode: 'spam',
    })).toThrow('Lead submission rejected');
  });

  it('rate limits repeated lead submissions per identifier', () => {
    for (let index = 0; index < 5; index += 1) {
      expect(checkAgencyLeadRateLimit('ip:127.0.0.1', 1_000).allowed).toBe(true);
    }

    const denied = checkAgencyLeadRateLimit('ip:127.0.0.1', 1_000);
    expect(denied.allowed).toBe(false);
    expect(denied.retryAfterSeconds).toBeGreaterThan(0);

    expect(checkAgencyLeadRateLimit('ip:127.0.0.1', 1_000 + (10 * 60 * 1000) + 1).allowed).toBe(true);
  });

  it('maps a qualified lead into a manual agency client input', () => {
    const input = buildAgencyClientInputFromLead(baseLead);

    expect(input).toEqual(expect.objectContaining({
      name: 'Acme',
      website: 'https://example.com',
      primaryContactName: 'Lucas',
      primaryContactEmail: 'lucas@example.com',
      packageType: 'monthly-founder-content',
      status: 'lead',
    }));
    expect(input.notes).toContain('Lead message:');
    expect(input.notes).toContain('Original lead email: lucas@example.com');
  });
});
