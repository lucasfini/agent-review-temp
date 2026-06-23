const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '../..');

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

describe('Phase 8G browser deployment smoke QA artifacts', () => {
  it('documents the launch smoke routes, browser checks, deployment checklist, and blockers', () => {
    const report = read('PHASE_8G_BROWSER_DEPLOYMENT_SMOKE_QA.md');

    [
      'Routes Tested',
      'Browser And Mobile Checks',
      'Issues Found',
      'Deployment Smoke Checklist',
      'Remaining Launch Blockers',
      'Validation',
    ].forEach((section) => {
      expect(report).toContain(section);
    });

    [
      '/',
      '/auth/login',
      '/auth/signup',
      '/dashboard',
      '/dashboard/billing',
      '/dashboard/studio/profile',
      '/dashboard/studio/voice',
      '/dashboard/studio/plans',
      '/dashboard/content',
      '/dashboard/agency',
      '/dashboard/agency/leads',
      'POST /api/agency-leads with invalid email returns 400',
      'GET /api/agency/leads unauthenticated returns 401',
      'GET /api/agency-funnel-events returns 405',
      'Mobile: 390x900',
      'Desktop: 1440x1000',
    ].forEach((item) => {
      expect(report).toContain(item);
    });
  });

  it('keeps the Playwright smoke spec focused on the Phase 8G launch surface', () => {
    const spec = read('tests/e2e/phase-8g-browser-deployment-smoke.spec.ts');
    const contentRedirect = read('app/dashboard/content/page.tsx');

    [
      "'/'",
      "'/auth/login'",
      "'/auth/signup'",
      "'/dashboard'",
      "'/dashboard/billing'",
      "'/dashboard/studio/profile'",
      "'/dashboard/studio/voice'",
      "'/dashboard/studio/plans'",
      "'/dashboard/content'",
      "'/dashboard/agency'",
      "'/dashboard/agency/leads'",
      "request.post('/api/agency-leads'",
      "request.get('/api/agency/leads')",
      "request.get('/api/agency-funnel-events')",
      'toHaveURL(/\\/auth\\/login/',
      'expectNoHorizontalOverflow',
    ].forEach((item) => {
      expect(spec).toContain(item);
    });

    expect(contentRedirect).toContain("redirect('/dashboard/hub')");
  });
});
