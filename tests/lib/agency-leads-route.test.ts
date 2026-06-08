import { RouteAccessError } from '@/lib/api/route-auth';

const mockRequireAgencyAccess = jest.fn();
const mockCreateAgencyLead = jest.fn();
const mockListAgencyLeads = jest.fn();
const mockGetAgencyLead = jest.fn();
const mockUpdateAgencyLead = jest.fn();
const mockConvertAgencyLeadToClient = jest.fn();
const mockCheckAgencyLeadRateLimit = jest.fn();
const mockIsLikelySpamLead = jest.fn();
const mockSendAgencyLeadNotification = jest.fn();
const mockSendAgencyLeadConfirmationEmail = jest.fn();
const mockCreateAgencyFunnelEvent = jest.fn();
const mockIsDemoUser = jest.fn();

jest.mock('@/lib/authz/agency-permissions', () => {
  const actual = jest.requireActual('@/lib/authz/agency-permissions');
  return {
    ...actual,
    requireAgencyAccess: (...args: any[]) => mockRequireAgencyAccess(...args),
  };
});

jest.mock('@/lib/agency-leads', () => {
  const actual = jest.requireActual('@/lib/agency-leads');
  return {
    ...actual,
    createAgencyLead: (...args: any[]) => mockCreateAgencyLead(...args),
    listAgencyLeads: (...args: any[]) => mockListAgencyLeads(...args),
    getAgencyLead: (...args: any[]) => mockGetAgencyLead(...args),
    updateAgencyLead: (...args: any[]) => mockUpdateAgencyLead(...args),
    convertAgencyLeadToClient: (...args: any[]) => mockConvertAgencyLeadToClient(...args),
  };
});

jest.mock('@/lib/agency-lead-rate-limit', () => ({
  checkAgencyLeadRateLimit: (...args: any[]) => mockCheckAgencyLeadRateLimit(...args),
  isLikelySpamLead: (...args: any[]) => mockIsLikelySpamLead(...args),
}));

jest.mock('@/lib/agency-lead-notifications', () => ({
  sendAgencyLeadConfirmationEmail: (...args: any[]) => mockSendAgencyLeadConfirmationEmail(...args),
  sendAgencyLeadNotification: (...args: any[]) => mockSendAgencyLeadNotification(...args),
}));

jest.mock('@/lib/agency-funnel-events', () => ({
  createAgencyFunnelEvent: (...args: any[]) => mockCreateAgencyFunnelEvent(...args),
}));

jest.mock('@/lib/demo-mode', () => ({
  isDemoUser: (...args: any[]) => mockIsDemoUser(...args),
}));

jest.mock('@/lib/supabase/server', () => ({
  supabaseAdmin: { from: jest.fn() },
}));

const user = { id: 'user-1', email: 'admin@example.com' };
const organization = {
  id: 'agency-org',
  name: 'Internal Agency',
  type: 'internal_agency',
};
const membership = {
  role: 'agency_admin',
  status: 'active',
};
const lead = {
  id: 'lead-1',
  name: 'Lucas',
  email: 'lucas@example.com',
  company: 'Acme',
  website: 'https://example.com',
  role: 'Founder',
  packageInterest: 'monthly-founder-content',
  budgetRange: '$5k-$10k/mo',
  timeline: 'This quarter',
  message: 'Need help turning calls into content.',
  source: 'agency_website',
  status: 'new',
  metadata: {},
  convertedClientId: null,
  convertedAt: null,
  convertedBy: null,
  createdAt: '2026-06-08T00:00:00.000Z',
  updatedAt: '2026-06-08T00:00:00.000Z',
};
const client = {
  id: 'client-1',
  organizationId: 'agency-org',
  name: 'Acme',
  website: 'https://example.com',
  industry: null,
  primaryContactName: 'Lucas',
  primaryContactEmail: 'lucas@example.com',
  packageType: 'monthly-founder-content',
  status: 'lead',
  notes: null,
  createdBy: 'user-1',
  createdAt: '2026-06-08T00:00:00.000Z',
  updatedAt: '2026-06-08T00:00:00.000Z',
};

describe('agency lead routes', () => {
  beforeEach(() => {
    mockRequireAgencyAccess.mockReset();
    mockCreateAgencyLead.mockReset();
    mockListAgencyLeads.mockReset();
    mockGetAgencyLead.mockReset();
    mockUpdateAgencyLead.mockReset();
    mockConvertAgencyLeadToClient.mockReset();
    mockCheckAgencyLeadRateLimit.mockReset();
    mockIsLikelySpamLead.mockReset();
    mockSendAgencyLeadNotification.mockReset();
    mockSendAgencyLeadConfirmationEmail.mockReset();
    mockCreateAgencyFunnelEvent.mockReset();
    mockIsDemoUser.mockReset();

    mockRequireAgencyAccess.mockResolvedValue({ user, organization, membership });
    mockCheckAgencyLeadRateLimit.mockResolvedValue({
      allowed: true,
      remaining: 4,
      retryAfterSeconds: 0,
    });
    mockIsLikelySpamLead.mockReturnValue({ isSpam: false, reason: null });
    mockSendAgencyLeadNotification.mockResolvedValue({ delivered: true });
    mockSendAgencyLeadConfirmationEmail.mockResolvedValue({ delivered: true });
    mockCreateAgencyFunnelEvent.mockResolvedValue({ event_name: 'agency_intake_submitted' });
    mockCreateAgencyLead.mockResolvedValue(lead);
    mockListAgencyLeads.mockResolvedValue([lead]);
    mockGetAgencyLead.mockResolvedValue(lead);
    mockUpdateAgencyLead.mockResolvedValue({ ...lead, status: 'qualified' });
    mockConvertAgencyLeadToClient.mockResolvedValue({
      lead: { ...lead, status: 'converted', convertedClientId: 'client-1' },
      client,
    });
    mockIsDemoUser.mockReturnValue(false);
  });

  it('creates public agency leads without creating agency clients', async () => {
    const { POST } = await import('@/app/api/agency-leads/route');

    const response = await POST(new Request('http://localhost/api/agency-leads', {
      method: 'POST',
      headers: { 'x-forwarded-for': '127.0.0.1' },
      body: JSON.stringify({
        email: 'Lucas@Example.com',
        company: 'Acme',
        message: 'We need help.',
      }),
    }) as any);
    const payload = await response.json();

    expect(response.status).toBe(201);
    expect(payload.lead).toEqual({ id: 'lead-1', status: 'new' });
    expect(mockCreateAgencyLead).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        email: 'Lucas@Example.com',
        company: 'Acme',
      })
    );
    expect(mockCreateAgencyFunnelEvent).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        eventName: 'agency_intake_submitted',
        leadId: 'lead-1',
        path: '/agency/contact',
      })
    );
    expect(mockSendAgencyLeadNotification).toHaveBeenCalledWith(lead);
    expect(mockSendAgencyLeadConfirmationEmail).toHaveBeenCalledWith(lead);
    expect(mockConvertAgencyLeadToClient).not.toHaveBeenCalled();
  });

  it('rejects invalid public lead emails before storage', async () => {
    const { POST } = await import('@/app/api/agency-leads/route');

    const response = await POST(new Request('http://localhost/api/agency-leads', {
      method: 'POST',
      body: JSON.stringify({ email: 'bad-email' }),
    }) as any);
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.error).toBe('Please enter a valid email address');
    expect(mockCreateAgencyLead).not.toHaveBeenCalled();
    expect(mockCheckAgencyLeadRateLimit).not.toHaveBeenCalled();
    expect(mockIsLikelySpamLead).not.toHaveBeenCalled();
    expect(mockCreateAgencyFunnelEvent).not.toHaveBeenCalled();
    expect(mockSendAgencyLeadNotification).not.toHaveBeenCalled();
    expect(mockSendAgencyLeadConfirmationEmail).not.toHaveBeenCalled();
  });

  it('rate limits public agency lead submissions', async () => {
    const { POST } = await import('@/app/api/agency-leads/route');
    mockCheckAgencyLeadRateLimit
      .mockResolvedValueOnce({ allowed: false, remaining: 0, retryAfterSeconds: 60 })
      .mockResolvedValueOnce({ allowed: true, remaining: 4, retryAfterSeconds: 0 });

    const response = await POST(new Request('http://localhost/api/agency-leads', {
      method: 'POST',
      body: JSON.stringify({ email: 'lucas@example.com' }),
    }) as any);
    const payload = await response.json();

    expect(response.status).toBe(429);
    expect(payload.retryAfterSeconds).toBe(60);
    expect(mockCreateAgencyLead).not.toHaveBeenCalled();
    expect(mockCreateAgencyFunnelEvent).not.toHaveBeenCalled();
    expect(mockSendAgencyLeadNotification).not.toHaveBeenCalled();
    expect(mockSendAgencyLeadConfirmationEmail).not.toHaveBeenCalled();
  });

  it('rejects likely spam lead submissions before storage', async () => {
    const { POST } = await import('@/app/api/agency-leads/route');
    mockIsLikelySpamLead.mockReturnValue({ isSpam: true, reason: 'too_many_links' });

    const response = await POST(new Request('http://localhost/api/agency-leads', {
      method: 'POST',
      body: JSON.stringify({
        email: 'lead@example.com',
        message: 'https://a.test https://b.test https://c.test https://d.test',
      }),
    }) as any);
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.error).toBe('Lead submission rejected');
    expect(mockCheckAgencyLeadRateLimit).not.toHaveBeenCalled();
    expect(mockCreateAgencyLead).not.toHaveBeenCalled();
    expect(mockCreateAgencyFunnelEvent).not.toHaveBeenCalled();
    expect(mockSendAgencyLeadNotification).not.toHaveBeenCalled();
    expect(mockSendAgencyLeadConfirmationEmail).not.toHaveBeenCalled();
  });

  it('does not fail public lead creation when internal notification email fails', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const { POST } = await import('@/app/api/agency-leads/route');
    mockSendAgencyLeadNotification.mockRejectedValue(new Error('Resend unavailable'));

    const response = await POST(new Request('http://localhost/api/agency-leads', {
      method: 'POST',
      body: JSON.stringify({
        email: 'lucas@example.com',
        company: 'Acme',
      }),
    }) as any);
    const payload = await response.json();

    expect(response.status).toBe(201);
    expect(payload.lead).toEqual({ id: 'lead-1', status: 'new' });
    expect(mockCreateAgencyLead).toHaveBeenCalled();
    expect(mockCreateAgencyFunnelEvent).toHaveBeenCalled();
    expect(mockSendAgencyLeadNotification).toHaveBeenCalledWith(lead);
    expect(mockSendAgencyLeadConfirmationEmail).toHaveBeenCalledWith(lead);
    errorSpy.mockRestore();
  });

  it('does not fail public lead creation when confirmation email fails', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const { POST } = await import('@/app/api/agency-leads/route');
    mockSendAgencyLeadConfirmationEmail.mockRejectedValue(new Error('Resend unavailable'));

    const response = await POST(new Request('http://localhost/api/agency-leads', {
      method: 'POST',
      body: JSON.stringify({
        email: 'lucas@example.com',
        company: 'Acme',
      }),
    }) as any);
    const payload = await response.json();

    expect(response.status).toBe(201);
    expect(payload.lead).toEqual({ id: 'lead-1', status: 'new' });
    expect(mockCreateAgencyLead).toHaveBeenCalled();
    expect(mockCreateAgencyFunnelEvent).toHaveBeenCalled();
    expect(mockSendAgencyLeadNotification).toHaveBeenCalledWith(lead);
    expect(mockSendAgencyLeadConfirmationEmail).toHaveBeenCalledWith(lead);
    errorSpy.mockRestore();
  });

  it('does not fail public lead creation when submitted event tracking fails', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const { POST } = await import('@/app/api/agency-leads/route');
    mockCreateAgencyFunnelEvent.mockRejectedValue(new Error('analytics unavailable'));

    const response = await POST(new Request('http://localhost/api/agency-leads', {
      method: 'POST',
      body: JSON.stringify({
        email: 'lucas@example.com',
        company: 'Acme',
      }),
    }) as any);
    const payload = await response.json();

    expect(response.status).toBe(201);
    expect(payload.lead).toEqual({ id: 'lead-1', status: 'new' });
    expect(mockCreateAgencyLead).toHaveBeenCalled();
    expect(mockSendAgencyLeadNotification).toHaveBeenCalledWith(lead);
    expect(mockSendAgencyLeadConfirmationEmail).toHaveBeenCalledWith(lead);
    warnSpy.mockRestore();
  });

  it('lists leads only for internal agency admins', async () => {
    const { GET } = await import('@/app/api/agency/leads/route');

    const response = await GET(
      new Request('http://localhost/api/agency/leads?organization_id=agency-org') as any
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.leads).toEqual([lead]);
    expect(mockRequireAgencyAccess).toHaveBeenCalledWith(
      expect.anything(),
      {
        requestedOrganizationId: 'agency-org',
        requireClientManagement: true,
      }
    );
    expect(mockListAgencyLeads).toHaveBeenCalledWith(expect.anything(), {
      status: null,
      limit: 50,
    });
  });

  it('denies SaaS organization access to internal lead review', async () => {
    const { GET } = await import('@/app/api/agency/leads/route');
    mockRequireAgencyAccess.mockRejectedValue(
      new RouteAccessError(403, 'Agency client management requires internal agency admin access')
    );

    const response = await GET(
      new Request('http://localhost/api/agency/leads?organization_id=saas-org') as any
    );
    const payload = await response.json();

    expect(response.status).toBe(403);
    expect(payload.error).toBe('Agency client management requires internal agency admin access');
    expect(mockListAgencyLeads).not.toHaveBeenCalled();
  });

  it('blocks demo users from lead status updates', async () => {
    const { PATCH } = await import('@/app/api/agency/leads/[id]/route');
    mockIsDemoUser.mockReturnValue(true);

    const response = await PATCH(new Request('http://localhost/api/agency/leads/lead-1', {
      method: 'PATCH',
      body: JSON.stringify({ organization_id: 'agency-org', status: 'qualified' }),
    }) as any, { params: Promise.resolve({ id: 'lead-1' }) });
    const payload = await response.json();

    expect(response.status).toBe(403);
    expect(payload.error).toBe('Demo account is read-only');
    expect(mockUpdateAgencyLead).not.toHaveBeenCalled();
  });

  it('converts leads into clients only after agency admin authorization', async () => {
    const { POST } = await import('@/app/api/agency/leads/[id]/convert/route');

    const response = await POST(new Request('http://localhost/api/agency/leads/lead-1/convert', {
      method: 'POST',
      body: JSON.stringify({ organization_id: 'agency-org' }),
    }) as any, { params: Promise.resolve({ id: 'lead-1' }) });
    const payload = await response.json();

    expect(response.status).toBe(201);
    expect(payload.client).toEqual(client);
    expect(payload.lead.convertedClientId).toBe('client-1');
    expect(mockRequireAgencyAccess).toHaveBeenCalledWith(
      expect.anything(),
      {
        requestedOrganizationId: 'agency-org',
        requireClientManagement: true,
      }
    );
    expect(mockConvertAgencyLeadToClient).toHaveBeenCalledWith(
      expect.anything(),
      'agency-org',
      'user-1',
      'lead-1'
    );
  });
});
