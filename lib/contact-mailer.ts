import { SUPPORT_EMAIL } from '@/lib/site-config';

type ContactEmailInput = {
  requesterEmail: string;
  category: string;
  severity: string;
  affectedPage?: string | null;
  serviceArea?: string | null;
  projectTitle?: string | null;
  subject: string;
  message: string;
  screenshotUrl?: string | null;
};

const RESEND_TIMEOUT_MS = 15_000;

function getResendConfig() {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.CONTACT_FROM_EMAIL?.trim() || SUPPORT_EMAIL;
  const to = process.env.CONTACT_TO_EMAIL?.trim() || SUPPORT_EMAIL;

  if (!apiKey) {
    return null;
  }

  return { apiKey, from, to };
}

function buildTextBody(input: ContactEmailInput) {
  return [
    `From: ${input.requesterEmail}`,
    `Category: ${input.category}`,
    `Severity: ${input.severity}`,
    input.affectedPage ? `Affected page: ${input.affectedPage}` : null,
    input.serviceArea ? `Service area: ${input.serviceArea}` : null,
    input.projectTitle ? `Project: ${input.projectTitle}` : null,
    input.screenshotUrl ? `Screenshot: ${input.screenshotUrl}` : null,
    '',
    input.message,
  ].filter(Boolean).join('\n');
}

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function buildHtmlBody(input: ContactEmailInput) {
  const rows = [
    ['From', input.requesterEmail],
    ['Category', input.category],
    ['Severity', input.severity],
    ['Affected page', input.affectedPage || '—'],
    ['Service area', input.serviceArea || '—'],
    ['Project', input.projectTitle || '—'],
    ['Screenshot', input.screenshotUrl || '—'],
  ];

  const metadata = rows
    .map(([label, value]) => `<tr><td style="padding:6px 12px 6px 0;font-weight:600;vertical-align:top;">${escapeHtml(label)}</td><td style="padding:6px 0;">${escapeHtml(value)}</td></tr>`)
    .join('');

  return `
    <div style="font-family:Arial,sans-serif;color:#0f172a;line-height:1.6;">
      <h2 style="margin:0 0 12px;">New AudioRepurpose support request</h2>
      <table style="border-collapse:collapse;margin:0 0 20px;">${metadata}</table>
      <h3 style="margin:0 0 8px;">Message</h3>
      <div style="white-space:pre-wrap;border:1px solid #e2e8f0;border-radius:12px;padding:16px;background:#f8fafc;">${escapeHtml(input.message)}</div>
    </div>
  `;
}

export async function sendContactEmail(input: ContactEmailInput) {
  const config = getResendConfig();
  if (!config) {
    return { delivered: false, reason: 'Resend is not configured' };
  }

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
        from: config.from,
        to: [config.to],
        reply_to: input.requesterEmail,
        subject: `[AudioRepurpose] ${input.subject}`,
        text: buildTextBody(input),
        html: buildHtmlBody(input),
      }),
      signal: abortController.signal,
      cache: 'no-store',
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(errorText || `Resend API request failed with status ${response.status}`);
    }
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('Resend send timed out');
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }

  return { delivered: true as const };
}
