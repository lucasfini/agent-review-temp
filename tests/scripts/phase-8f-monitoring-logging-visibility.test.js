const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '../..');

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

describe('Phase 8F monitoring, logging, and error visibility artifacts', () => {
  it('documents critical flows, expected logs, safe logging rules, monitoring recommendations, and triage steps', () => {
    const report = read('docs/archive/phase-handoffs/PHASE_8F_MONITORING_LOGGING_ERROR_VISIBILITY.md');
    const reportLower = report.toLowerCase();

    [
      'Critical Flows',
      'Expected Logs',
      'What Not To Log',
      'Existing Operational Surfaces',
      'Production Monitoring Recommendations',
      'Launch Triage Checklist',
      'Known Limitations',
      'Launch Blockers',
    ].forEach((section) => {
      expect(report).toContain(section);
    });

    [
      'agency lead submission',
      'lead notification email',
      'lead confirmation email',
      'stripe webhook',
      'subscription checkout/portal',
      'slack oauth/callback/import',
      'granola import',
      'source-to-draft generation',
      'upload/finalize/transcription',
      'content generation',
    ].forEach((item) => {
      expect(reportLower).toContain(item);
    });

    [
      '/api/health',
      '/admin/monitoring',
      'docker-compose.prod.yml',
      'raw AI responses',
      'Slack OAuth `code`, raw `state`, access tokens',
    ].forEach((item) => {
      expect(report).toContain(item);
    });
  });

  it('keeps critical launch flows covered by searchable failure logs', () => {
    const expectations = [
      ['app/api/agency-leads/route.ts', ['[AGENCY_LEADS_PUBLIC]', 'Lead notification failed:', 'Lead confirmation failed:']],
      ['app/api/agency-funnel-events/route.ts', ['[AGENCY_FUNNEL_EVENTS]']],
      ['app/api/stripe/webhook/route.ts', ['Webhook signature verification failed:', 'Error processing webhook:', '[STRIPE]']],
      ['app/api/subscriptions/checkout/route.ts', ['[SUBSCRIPTION CHECKOUT] Failed to create checkout session:']],
      ['app/api/subscriptions/portal/route.ts', ['[SUBSCRIPTION PORTAL] Failed to create portal session:']],
      ['app/api/agency/slack/oauth/start/route.ts', ['[AGENCY_SLACK_OAUTH_START] Configuration error:']],
      ['app/api/agency/slack/oauth/callback/route.ts', ['[AGENCY_SLACK_OAUTH_CALLBACK] Configuration error:', '[AGENCY_SLACK_OAUTH_CALLBACK] OAuth callback issue:']],
      ['app/api/agency/slack/import/route.ts', ['[AGENCY_SLACK_IMPORT] Unexpected error:']],
      ['app/api/agency/granola/imports/route.ts', ['[AGENCY_GRANOLA_IMPORTS] Unexpected error:']],
      ['app/api/agency/source-imports/[id]/generate/route.ts', ['[AGENCY_SOURCE_GENERATE] Unexpected error:']],
      ['app/api/upload/init/route.ts', ['Project creation error:', 'Init upload error:']],
      ['app/api/upload/finalize/route.ts', ['R2 verification failed:', 'Transcription start failed:', 'Failed to start transcription:', 'Finalize error:']],
      ['app/api/transcribe/route.ts', ['[TRANSCRIPTION]', 'Failed to run background tasks:', 'Could not update project status to failed:']],
      ['app/api/projects/[id]/generate/route.ts', ['[PROJECT-GENERATE] Failed to insert jobs:', '[PROJECT-GENERATE] Failed to start processor:', '[PROJECT-GENERATE] Error:']],
      ['app/api/generate-content/route.ts', ['[GENERATION ERROR]:', 'logAIResponseShape']],
      ['app/api/strict-json-content/route.ts', ['[STRICT-JSON-API]']],
    ];

    expectations.forEach(([relativePath, markers]) => {
      const file = read(relativePath);
      markers.forEach((marker) => {
        expect(file).toContain(marker);
      });
    });
  });

  it('uses existing health and admin monitoring surfaces without adding a new monitoring vendor', () => {
    const healthRoute = read('app/api/health/route.ts');
    const adminMonitoringRoute = read('app/api/admin/monitoring/route.ts');
    const adminMonitoringPage = read('app/dashboard/admin/monitoring/page.tsx');
    const prodCompose = read('docker-compose.prod.yml');
    const report = read('docs/archive/phase-handoffs/PHASE_8F_MONITORING_LOGGING_ERROR_VISIBILITY.md');

    expect(healthRoute).toContain("status: 'healthy'");
    expect(healthRoute).toContain('process.uptime()');
    expect(adminMonitoringRoute).toContain('isAdminEmail');
    expect(adminMonitoringRoute).toContain('failedProjects');
    expect(adminMonitoringPage).toContain('Failed Projects');
    expect(prodCompose).toContain('json-file');
    expect(prodCompose).toContain('max-size: "10m"');
    expect(report).toContain('did not add a paid observability vendor');
  });

  it('keeps Slack OAuth logging sanitized and avoids raw AI response logging in generation failures', () => {
    const slackCallback = read('app/api/agency/slack/oauth/callback/route.ts');
    const generationRoute = read('app/api/generate-content/route.ts');

    expect(slackCallback).toContain('logSlackOAuthCallbackIssue');
    expect(slackCallback).toContain('safeSlackOAuthReason(reason)');
    expect(slackCallback).not.toMatch(/console\.(warn|error)\([^)]*(access_token|refresh_token|clientSecret|client_secret)/i);
    expect(slackCallback).not.toMatch(/console\.(warn|error)\([^)]*(\bcode\b|\bstate\b)/i);

    expect(generationRoute).toContain('logAIResponseShape');
    expect(generationRoute).toContain('contentLength');
    expect(generationRoute).not.toContain('Raw content preview');
    expect(generationRoute).not.toMatch(/AI response:', content/);
  });

  it('does not add direct secret or token logging to the Phase 8F touched runtime files', () => {
    [
      'app/api/agency/slack/oauth/start/route.ts',
      'app/api/agency/slack/oauth/callback/route.ts',
      'app/api/generate-content/route.ts',
    ].forEach((relativePath) => {
      const file = read(relativePath);
      expect(file).not.toMatch(/console\.(log|warn|error)\([^)]*process\.env/i);
      expect(file).not.toMatch(/console\.(log|warn|error)\([^)]*(OPENAI_API_KEY|SUPABASE_SERVICE_ROLE_KEY|STRIPE_SECRET_KEY|STRIPE_WEBHOOK_SECRET|SLACK_CLIENT_SECRET|INTEGRATIONS_ENCRYPTION_KEY)/i);
      expect(file).not.toMatch(/console\.(log|warn|error)\([^)]*(accessToken|refreshToken|uploadToken|authHeader|Authorization)/i);
    });
  });
});
