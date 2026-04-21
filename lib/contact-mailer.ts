import nodemailer from 'nodemailer';
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

let cachedTransporter: nodemailer.Transporter | null = null;

function getSmtpConfig() {
  const host = process.env.SMTP_HOST?.trim();
  const port = Number(process.env.SMTP_PORT || '587');
  const secure = String(process.env.SMTP_SECURE || 'false').toLowerCase() === 'true';
  const user = process.env.SMTP_USER?.trim();
  const pass = process.env.SMTP_PASS?.trim();
  const from = process.env.CONTACT_FROM_EMAIL?.trim() || SUPPORT_EMAIL;
  const to = process.env.CONTACT_TO_EMAIL?.trim() || SUPPORT_EMAIL;

  if (!host || !port || !user || !pass) {
    return null;
  }

  return { host, port, secure, user, pass, from, to };
}

function getTransporter() {
  const config = getSmtpConfig();
  if (!config) return null;

  if (!cachedTransporter) {
    cachedTransporter = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      auth: {
        user: config.user,
        pass: config.pass,
      },
    });
  }

  return { transporter: cachedTransporter, config };
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
  const mailer = getTransporter();
  if (!mailer) {
    return { delivered: false, reason: 'SMTP is not configured' };
  }

  await mailer.transporter.sendMail({
    from: mailer.config.from,
    to: mailer.config.to,
    replyTo: input.requesterEmail,
    subject: `[AudioRepurpose] ${input.subject}`,
    text: buildTextBody(input),
    html: buildHtmlBody(input),
  });

  return { delivered: true as const };
}
