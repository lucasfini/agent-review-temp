import {
  AgencyLeadValidationError,
  buildAgencyClientInputFromLead,
  normalizeAgencyLeadSubmission,
  resolveAgencyLeadOrganizationId,
  type AgencyLead,
} from '@/lib/agency-leads';

const baseLead: AgencyLead = {
  id: 'lead-1',
  organizationId: 'agency-org',
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
  qualificationScore: 82,
  qualificationTier: 'high',
  assignedTo: null,
  reviewNotes: null,
  lastContactedAt: null,
  nextFollowUpAt: null,
  metadata: {},
  convertedClientId: null,
  convertedAt: null,
  convertedBy: null,
  createdAt: '2026-06-08T00:00:00.000Z',
  updatedAt: '2026-06-08T00:00:00.000Z',
};

describe('agency lead helpers', () => {
  const originalAgencyLeadOrganizationId = process.env.AGENCY_LEAD_ORGANIZATION_ID;

  afterEach(() => {
    if (originalAgencyLeadOrganizationId === undefined) {
      delete process.env.AGENCY_LEAD_ORGANIZATION_ID;
    } else {
      process.env.AGENCY_LEAD_ORGANIZATION_ID = originalAgencyLeadOrganizationId;
    }
  });

  function mockOrganizationSupabase({
    list,
    single,
    error = null,
  }: {
    list?: Array<{ id: string; type: string }>;
    single?: { id: string; type: string } | null;
    error?: any;
  }) {
    const query: any = {};
    query.select = jest.fn(() => query);
    query.eq = jest.fn(() => query);
    query.order = jest.fn(() => query);
    query.limit = jest.fn(() => Promise.resolve({ data: list || [], error }));
    query.maybeSingle = jest.fn(() => Promise.resolve({ data: single ?? null, error }));

    return {
      from: jest.fn(() => query),
      query,
    };
  }

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
      qualification_score: expect.any(Number),
      qualification_tier: expect.any(String),
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

  it('resolves configured internal agency organization for public lead ownership', async () => {
    process.env.AGENCY_LEAD_ORGANIZATION_ID = 'agency-org';
    const { from, query } = mockOrganizationSupabase({
      single: { id: 'agency-org', type: 'internal_agency' },
    });

    await expect(resolveAgencyLeadOrganizationId({ from } as any)).resolves.toBe('agency-org');
    expect(query.eq).toHaveBeenCalledWith('id', 'agency-org');
  });

  it('rejects configured non-agency organization for public lead ownership', async () => {
    process.env.AGENCY_LEAD_ORGANIZATION_ID = 'saas-org';
    const { from } = mockOrganizationSupabase({
      single: { id: 'saas-org', type: 'saas_customer' },
    });

    await expect(resolveAgencyLeadOrganizationId({ from } as any))
      .rejects.toThrow('AGENCY_LEAD_ORGANIZATION_ID must reference an internal agency organization');
  });

  it('requires explicit organization configuration when multiple internal agency orgs exist', async () => {
    delete process.env.AGENCY_LEAD_ORGANIZATION_ID;
    const { from } = mockOrganizationSupabase({
      list: [
        { id: 'agency-org-1', type: 'internal_agency' },
        { id: 'agency-org-2', type: 'internal_agency' },
      ],
    });

    await expect(resolveAgencyLeadOrganizationId({ from } as any))
      .rejects.toThrow('AGENCY_LEAD_ORGANIZATION_ID is required when multiple internal agency organizations exist');
  });
});
