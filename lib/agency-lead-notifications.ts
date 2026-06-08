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
  replyTo: string;
  subject: string;
  text: string;
  html: string;
  reviewUrl: string | null;
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
  const abortController = new AbortController();
  const timeoutId = setTimeout(() => abortController.abort(), RESEND_TIMEOUT_MS);

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: email.from,
        to: email.to,
        reply_to: email.replyTo,
        subject: email.subject,
        text: email.text,
        html: email.html,
      }),
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
