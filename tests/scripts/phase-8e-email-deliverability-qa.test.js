const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '../..');

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

describe('Phase 8E email deliverability QA artifacts', () => {
  it('documents the required email environment, sender verification, manual QA, failure behavior, and blockers', () => {
    const report = read('docs/archive/phase-handoffs/PHASE_8E_EMAIL_DELIVERABILITY_QA.md');

    [
      'Required Environment',
      'Sender and Domain Verification',
      'Internal Notification QA',
      'Public Confirmation QA',
      'Failure Behavior',
      'Local, Staging, and Production Differences',
      'Launch Checklist',
      'Launch blockers',
    ].forEach((section) => {
      expect(report).toContain(section);
    });

    [
      'RESEND_API_KEY',
      'AGENCY_LEAD_FROM_EMAIL',
      'AGENCY_LEAD_NOTIFICATION_EMAIL',
      'NEXT_PUBLIC_APP_URL',
      'AGENCY_LEAD_ORGANIZATION_ID',
      'CONTACT_FROM_EMAIL',
      'CONTACT_TO_EMAIL',
      'SPF',
      'DKIM',
      'DMARC',
      'reply_to',
      '201 Created',
    ].forEach((item) => {
      expect(report).toContain(item);
    });
  });

  it('keeps notification and confirmation builders scoped to safe lead email content', () => {
    const notifications = read('lib/agency-lead-notifications.ts');

    expect(notifications).toContain('const MESSAGE_EXCERPT_LENGTH = 700');
    expect(notifications).toContain('process.env.RESEND_API_KEY');
    expect(notifications).toContain('process.env.AGENCY_LEAD_FROM_EMAIL');
    expect(notifications).toContain('process.env.AGENCY_LEAD_NOTIFICATION_EMAIL');
    expect(notifications).toContain('process.env.CONTACT_FROM_EMAIL');
    expect(notifications).toContain('process.env.CONTACT_TO_EMAIL');
    expect(notifications).toContain('replyTo: lead.email');
    expect(notifications).toContain('[AudioRepurpose Agency] New lead:');
    expect(notifications).toContain('This message confirms receipt only. It does not create an account or client portal login.');
    expect(notifications).toContain("const url = new URL('/agency', appUrl)");
    expect(notifications).toContain("const url = new URL('/dashboard/agency/leads', appUrl)");
  });

  it('keeps public lead creation tolerant of notification and confirmation failures', () => {
    const route = read('app/api/agency-leads/route.ts');

    expect(route).toContain('const lead = await createAgencyLead');
    expect(route).toContain('sendAgencyLeadNotification(lead)');
    expect(route).toContain('sendAgencyLeadConfirmationEmail(lead)');
    expect(route).toContain('[AGENCY_LEADS_PUBLIC] Lead notification failed:');
    expect(route).toContain('[AGENCY_LEADS_PUBLIC] Lead confirmation failed:');
    expect(route).toContain('success: true');
    expect(route).toContain('status: 201');

    const createLeadIndex = route.indexOf('const lead = await createAgencyLead');
    const notificationIndex = route.indexOf('sendAgencyLeadNotification(lead)');
    const confirmationIndex = route.indexOf('sendAgencyLeadConfirmationEmail(lead)');

    expect(createLeadIndex).toBeGreaterThan(-1);
    expect(notificationIndex).toBeGreaterThan(createLeadIndex);
    expect(confirmationIndex).toBeGreaterThan(createLeadIndex);
  });
});
