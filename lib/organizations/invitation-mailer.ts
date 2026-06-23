import { SUPPORT_EMAIL } from '@/lib/site-config';
import type { WorkspaceInvitation } from '@/lib/organizations/team';

type WorkspaceInvitationEmailInput = {
  invitation: WorkspaceInvitation;
  workspaceName: string;
  acceptUrl: string;
  invitedByEmail?: string | null;
};

type WorkspaceInvitationEmailResult =
  | { delivered: true }
  | { delivered: false; reason: string };

const RESEND_TIMEOUT_MS = 15_000;

function getResendConfig() {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.CONTACT_FROM_EMAIL?.trim() || SUPPORT_EMAIL;

  if (!apiKey) {
    return null;
  }

  return { apiKey, from };
}

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function roleLabel(role: WorkspaceInvitation['role']) {
  if (role === 'admin') return 'admin';
  if (role === 'reader') return 'reader';
  return 'editor';
}

function buildTextBody(input: WorkspaceInvitationEmailInput) {
  const invitedByLine = input.invitedByEmail
    ? `${input.invitedByEmail} invited you to join ${input.workspaceName}.`
    : `You have been invited to join ${input.workspaceName}.`;

  return [
    invitedByLine,
    '',
    `Role: ${roleLabel(input.invitation.role)}`,
    `Invite expires: ${new Date(input.invitation.expiresAt).toLocaleString('en-US')}`,
    '',
    `Accept invite: ${input.acceptUrl}`,
    '',
    'If you were not expecting this invite, you can ignore this email.',
  ].join('\n');
}

function buildHtmlBody(input: WorkspaceInvitationEmailInput) {
  const workspaceName = escapeHtml(input.workspaceName);
  const invitedBy = input.invitedByEmail
    ? `${escapeHtml(input.invitedByEmail)} invited you to join`
    : 'You have been invited to join';
  const expires = escapeHtml(new Date(input.invitation.expiresAt).toLocaleString('en-US'));
  const role = escapeHtml(roleLabel(input.invitation.role));
  const acceptUrl = escapeHtml(input.acceptUrl);

  return `
    <div style="font-family:Arial,sans-serif;color:#0f172a;line-height:1.6;">
      <p style="margin:0 0 8px;color:#475569;">${invitedBy}</p>
      <h1 style="margin:0 0 16px;font-size:24px;">${workspaceName}</h1>
      <p style="margin:0 0 20px;">Join the workspace as a <strong>${role}</strong> to collaborate on transcripts, Studio context, content output, and billing-managed usage.</p>
      <p style="margin:0 0 24px;">
        <a href="${acceptUrl}" style="display:inline-block;background:#2563eb;color:#ffffff;text-decoration:none;border-radius:10px;padding:12px 18px;font-weight:700;">Accept workspace invite</a>
      </p>
      <p style="margin:0 0 8px;color:#475569;font-size:13px;">This invite expires ${expires}.</p>
      <p style="margin:0;color:#64748b;font-size:13px;">If you were not expecting this invite, you can ignore this email.</p>
    </div>
  `;
}

export async function sendWorkspaceInvitationEmail(
  input: WorkspaceInvitationEmailInput
): Promise<WorkspaceInvitationEmailResult> {
  const config = getResendConfig();
  if (!config) {
    return { delivered: false, reason: 'Resend is not configured' };
  }

  const abortController = new AbortController();
  const timeoutId = setTimeout(() => abortController.abort(), RESEND_TIMEOUT_MS);

  try {
    const body: Record<string, unknown> = {
      from: config.from,
      to: [input.invitation.email],
      subject: `Join ${input.workspaceName} on AudioRepurpose`,
      text: buildTextBody(input),
      html: buildHtmlBody(input),
    };
    if (input.invitedByEmail) {
      body.reply_to = input.invitedByEmail;
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
