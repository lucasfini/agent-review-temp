import {
  buildAgencyLeadConfirmationEmail,
  buildAgencyLeadNotificationEmail,
  sendAgencyLeadConfirmationEmail,
  sendAgencyLeadNotification,
} from '@/lib/agency-lead-notifications';
import type { AgencyLead } from '@/lib/agency-leads';

const originalEnv = process.env;

const lead: AgencyLead = {
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
  message: 'Need help turning customer calls into useful founder-led content.',
  source: 'agency_website',
  status: 'new',
  metadata: {},
  convertedClientId: null,
  convertedAt: null,
  convertedBy: null,
  createdAt: '2026-06-08T00:00:00.000Z',
  updatedAt: '2026-06-08T00:00:00.000Z',
};

describe('agency lead notification emails', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    process.env = { ...originalEnv };
    delete process.env.RESEND_API_KEY;
    delete process.env.AGENCY_LEAD_FROM_EMAIL;
    delete process.env.AGENCY_LEAD_NOTIFICATION_EMAIL;
    delete process.env.CONTACT_FROM_EMAIL;
    delete process.env.CONTACT_TO_EMAIL;
    delete process.env.NEXT_PUBLIC_APP_URL;
    global.fetch = jest.fn();
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('builds a safe internal notification payload with lead summary fields', () => {
    const email = buildAgencyLeadNotificationEmail(lead, {
      from: 'agency@example.com',
      to: ['ops@example.com'],
      appUrl: 'https://app.example.com',
    });

    expect(email.from).toBe('agency@example.com');
    expect(email.to).toEqual(['ops@example.com']);
    expect(email.replyTo).toBe('lucas@example.com');
    expect(email.subject).toBe('[AudioRepurpose Agency] New lead: Acme');
    expect(email.reviewUrl).toBe('https://app.example.com/dashboard/agency/leads');
    expect(email.text).toContain('Name: Lucas');
    expect(email.text).toContain('Email: lucas@example.com');
    expect(email.text).toContain('Package interest: monthly-founder-content');
    expect(email.text).toContain('Budget range: $5k-$10k/mo');
    expect(email.text).toContain('Message excerpt:');
    expect(email.html).toContain('New public agency lead');
  });

  it('truncates oversized lead messages before building the email body', () => {
    const longLead = {
      ...lead,
      message: 'a'.repeat(900),
    };

    const email = buildAgencyLeadNotificationEmail(longLead, {
      from: 'agency@example.com',
      to: ['ops@example.com'],
      appUrl: 'https://app.example.com',
    });

    expect(email.text).toContain(`${'a'.repeat(697)}...`);
    expect(email.text).not.toContain('a'.repeat(800));
  });

  it('does not send when Resend is not configured', async () => {
    const result = await sendAgencyLeadNotification(lead);

    expect(result).toEqual({
      delivered: false,
      reason: 'Resend agency lead notification is not configured',
    });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('sends through Resend with agency-specific recipients when configured', async () => {
    process.env.RESEND_API_KEY = 'resend-key';
    process.env.AGENCY_LEAD_FROM_EMAIL = 'agency@example.com';
    process.env.AGENCY_LEAD_NOTIFICATION_EMAIL = 'ops@example.com, lucas@example.com';
    process.env.NEXT_PUBLIC_APP_URL = 'https://app.example.com';
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
    });

    const result = await sendAgencyLeadNotification(lead);

    expect(result).toEqual({ delivered: true });
    expect(global.fetch).toHaveBeenCalledWith('https://api.resend.com/emails', expect.objectContaining({
      method: 'POST',
      headers: expect.objectContaining({
        Authorization: 'Bearer resend-key',
      }),
    }));
    const body = JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body);
    expect(body).toEqual(expect.objectContaining({
      from: 'agency@example.com',
      to: ['ops@example.com', 'lucas@example.com'],
      reply_to: 'lucas@example.com',
      subject: '[AudioRepurpose Agency] New lead: Acme',
    }));
    expect(body.text).toContain('Review link: https://app.example.com/dashboard/agency/leads');
  });

  it('falls back to existing contact email settings when agency-specific env vars are absent', async () => {
    process.env.RESEND_API_KEY = 'resend-key';
    process.env.CONTACT_FROM_EMAIL = 'support@example.com';
    process.env.CONTACT_TO_EMAIL = 'support-inbox@example.com';
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
    });

    await sendAgencyLeadNotification(lead);

    const body = JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body);
    expect(body.from).toBe('support@example.com');
    expect(body.to).toEqual(['support-inbox@example.com']);
  });

  it('builds a public confirmation payload without internal lead data', () => {
    const email = buildAgencyLeadConfirmationEmail(lead, {
      from: 'agency@example.com',
      appUrl: 'https://app.example.com',
    });

    expect(email.from).toBe('agency@example.com');
    expect(email.to).toEqual(['lucas@example.com']);
    expect(email.replyTo).toBeUndefined();
    expect(email.subject).toBe('We received your AudioRepurpose agency inquiry');
    expect(email.siteUrl).toBe('https://app.example.com/agency');
    expect(email.text).toContain('Thanks for reaching out about agency support');
    expect(email.text).toContain('What happens next:');
    expect(email.text).toContain('This message confirms receipt only');
    expect(email.text).not.toContain('lead-1');
    expect(email.text).not.toContain('/dashboard');
    expect(email.html).not.toContain('/dashboard');
  });

  it('sends the public confirmation email to the lead submitter', async () => {
    process.env.RESEND_API_KEY = 'resend-key';
    process.env.AGENCY_LEAD_FROM_EMAIL = 'agency@example.com';
    process.env.AGENCY_LEAD_NOTIFICATION_EMAIL = 'ops@example.com';
    process.env.NEXT_PUBLIC_APP_URL = 'https://app.example.com';
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
    });

    const result = await sendAgencyLeadConfirmationEmail(lead);

    expect(result).toEqual({ delivered: true });
    const body = JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body);
    expect(body).toEqual(expect.objectContaining({
      from: 'agency@example.com',
      to: ['lucas@example.com'],
      subject: 'We received your AudioRepurpose agency inquiry',
    }));
    expect(body.reply_to).toBeUndefined();
    expect(body.text).toContain('You can review the agency services here: https://app.example.com/agency');
    expect(body.text).not.toContain('/dashboard');
  });
});
