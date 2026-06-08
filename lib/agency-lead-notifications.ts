import type { AgencyLead } from '@/lib/agency-leads';
import { SUPPORT_EMAIL } from '@/lib/site-config';

const RESEND_TIMEOUT_MS = 15_000;
const MESSAGE_EXCERPT_LENGTH = 700;
const SUBJECT_DETAIL_LENGTH = 80;

type AgencyLeadNotificationConfig = {
  apiKey: string;
  from: string;
  to: string[];
  appUrl: string | null;
};

export type AgencyLeadNotificationEmail = {
  from: string;
  to: string[];
  replyTo?: string;
  subject: string;
  text: string;
  html: string;
  reviewUrl?: string | null;
  siteUrl?: string | null;
};

export type AgencyLeadNotificationResult =
  | { delivered: true }
  | { delivered: false; reason: string };

function splitEmails(value: string | undefined): string[] {
  return (value || '')
    .split(',')
    .map((email) => email.trim())
    .filter(Boolean);
}

function getResendConfig(): AgencyLeadNotificationConfig | null {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) {
    return null;
  }

  const from = process.env.AGENCY_LEAD_FROM_EMAIL?.trim()
    || process.env.CONTACT_FROM_EMAIL?.trim()
    || SUPPORT_EMAIL;
  const to = splitEmails(
    process.env.AGENCY_LEAD_NOTIFICATION_EMAIL?.trim()
      || process.env.CONTACT_TO_EMAIL?.trim()
      || SUPPORT_EMAIL
  );
  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.trim() || null;

  if (to.length === 0) {
    return null;
  }

  return { apiKey, from, to, appUrl };
}

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function fieldValue(value: string | null | undefined): string {
  const trimmed = value?.trim();
  return trimmed || 'Not provided';
}

function truncate(value: string | null | undefined, maxLength: number): string {
  const trimmed = value?.trim() || '';
  if (!trimmed) return 'Not provided';
  if (trimmed.length <= maxLength) return trimmed;
  return `${trimmed.slice(0, maxLength - 3).trimEnd()}...`;
}

function leadTitle(lead: AgencyLead): string {
  return truncate(lead.company || lead.name || lead.email, SUBJECT_DETAIL_LENGTH);
}

function dashboardReviewUrl(appUrl: string | null | undefined): string | null {
  if (!appUrl) return null;

  try {
    const url = new URL('/dashboard/agency/leads', appUrl);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    return url.toString();
  } catch {
    return null;
  }
}

function publicAgencyUrl(appUrl: string | null | undefined): string | null {
  if (!appUrl) return null;

  try {
    const url = new URL('/agency', appUrl);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    return url.toString();
  } catch {
    return null;
  }
}

export function buildAgencyLeadNotificationEmail(
  lead: AgencyLead,
  options: {
    from: string;
    to: string[];
    appUrl?: string | null;
  }
): AgencyLeadNotificationEmail {
  const reviewUrl = dashboardReviewUrl(options.appUrl);
  const messageExcerpt = truncate(lead.message, MESSAGE_EXCERPT_LENGTH);
  const rows = [
    ['Name', fieldValue(lead.name)],
    ['Email', lead.email],
    ['Company', fieldValue(lead.company)],
    ['Website', fieldValue(lead.website)],
    ['Role', fieldValue(lead.role)],
    ['Package interest', fieldValue(lead.packageInterest)],
    ['Timeline', fieldValue(lead.timeline)],
    ['Budget range', fieldValue(lead.budgetRange)],
    ['Submitted', fieldValue(lead.createdAt)],
    ['Review link', reviewUrl || 'Not configured'],
  ];

  const text = [
    'New public agency lead',
    '',
    ...rows.map(([label, value]) => `${label}: ${value}`),
    '',
    'Message excerpt:',
    messageExcerpt,
  ].join('\n');

  const metadata = rows
    .map(([label, value]) => `<tr><td style="padding:6px 12px 6px 0;font-weight:600;vertical-align:top;">${escapeHtml(label)}</td><td style="padding:6px 0;">${escapeHtml(value)}</td></tr>`)
    .join('');

  return {
    from: options.from,
    to: options.to,
    replyTo: lead.email,
    subject: `[AudioRepurpose Agency] New lead: ${leadTitle(lead)}`,
    text,
    html: `
      <div style="font-family:Arial,sans-serif;color:#0f172a;line-height:1.6;">
        <h2 style="margin:0 0 12px;">New public agency lead</h2>
        <table style="border-collapse:collapse;margin:0 0 20px;">${metadata}</table>
        <h3 style="margin:0 0 8px;">Message excerpt</h3>
        <div style="white-space:pre-wrap;border:1px solid #e2e8f0;border-radius:12px;padding:16px;background:#f8fafc;">${escapeHtml(messageExcerpt)}</div>
      </div>
    `,
    reviewUrl,
  };
}

export function buildAgencyLeadConfirmationEmail(
  lead: AgencyLead,
  options: {
    from: string;
    appUrl?: string | null;
  }
): AgencyLeadNotificationEmail {
  const siteUrl = publicAgencyUrl(options.appUrl);
  const greeting = lead.name ? `Hi ${lead.name},` : 'Hi,';
  const packageLine = lead.packageInterest
    ? `We also received your package interest as: ${lead.packageInterest}.`
    : 'We also received your package interest as: not sure yet.';

  const textLines = [
    greeting,
    '',
    'Thanks for reaching out about agency support from AudioRepurpose.',
    'We received your inquiry and will review the communication need, source material, and service fit before recommending a practical next step.',
    packageLine,
    '',
    'What happens next:',
    '- We review the inquiry for fit and useful context.',
    '- If there is a clear match, we follow up with a short next-step note.',
    '- If a different path looks more appropriate, we will keep the recommendation practical.',
    '',
    siteUrl ? `You can review the agency services here: ${siteUrl}` : 'You can review the agency services on the AudioRepurpose agency site.',
    '',
    'This message confirms receipt only. It does not create an account or client portal login.',
  ];

  return {
    from: options.from,
    to: [lead.email],
    subject: 'We received your AudioRepurpose agency inquiry',
    text: textLines.join('\n'),
    html: `
      <div style="font-family:Arial,sans-serif;color:#0f172a;line-height:1.6;">
        <p>${escapeHtml(greeting)}</p>
        <p>Thanks for reaching out about agency support from AudioRepurpose.</p>
        <p>We received your inquiry and will review the communication need, source material, and service fit before recommending a practical next step.</p>
        <p>${escapeHtml(packageLine)}</p>
        <h3 style="margin:20px 0 8px;">What happens next</h3>
        <ul>
          <li>We review the inquiry for fit and useful context.</li>
          <li>If there is a clear match, we follow up with a short next-step note.</li>
          <li>If a different path looks more appropriate, we will keep the recommendation practical.</li>
        </ul>
        <p>${siteUrl ? `You can review the agency services here: <a href="${escapeHtml(siteUrl)}">${escapeHtml(siteUrl)}</a>` : 'You can review the agency services on the AudioRepurpose agency site.'}</p>
        <p style="color:#475569;font-size:13px;">This message confirms receipt only. It does not create an account or client portal login.</p>
      </div>
    `,
    siteUrl,
  };
}

async function sendResendEmail(
  config: AgencyLeadNotificationConfig,
  email: AgencyLeadNotificationEmail
): Promise<AgencyLeadNotificationResult> {
  const abortController = new AbortController();
  const timeoutId = setTimeout(() => abortController.abort(), RESEND_TIMEOUT_MS);

  try {
    const body: Record<string, unknown> = {
      from: email.from,
      to: email.to,
      subject: email.subject,
      text: email.text,
      html: email.html,
    };
    if (email.replyTo) {
      body.reply_to = email.replyTo;
    }

    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: abortController.signal,
      cache: 'no-store',
    });

    if (!response.ok) {
      throw new Error(`Resend API request failed with status ${response.status}`);
    }
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('Resend send timed out');
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }

  return { delivered: true };
}

export async function sendAgencyLeadNotification(
  lead: AgencyLead
): Promise<AgencyLeadNotificationResult> {
  const config = getResendConfig();
  if (!config) {
    return { delivered: false, reason: 'Resend agency lead notification is not configured' };
  }

  const email = buildAgencyLeadNotificationEmail(lead, {
    from: config.from,
    to: config.to,
    appUrl: config.appUrl,
  });

  return sendResendEmail(config, email);
}

export async function sendAgencyLeadConfirmationEmail(
  lead: AgencyLead
): Promise<AgencyLeadNotificationResult> {
  const config = getResendConfig();
  if (!config) {
    return { delivered: false, reason: 'Resend agency lead confirmation is not configured' };
  }

  const email = buildAgencyLeadConfirmationEmail(lead, {
    from: config.from,
    appUrl: config.appUrl,
  });

  return sendResendEmail(config, email);
}
