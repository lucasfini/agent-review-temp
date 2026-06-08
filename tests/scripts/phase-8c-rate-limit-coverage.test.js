const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '../..');

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

describe('Phase 8C rate limit and abuse protection coverage', () => {
  it('keeps public agency lead and funnel routes rate limited before writes', () => {
    const leadsRoute = read('app/api/agency-leads/route.ts');
    const funnelRoute = read('app/api/agency-funnel-events/route.ts');
    const funnelHelper = read('lib/agency-funnel-events.ts');

    expect(leadsRoute).toContain('checkAgencyLeadRateLimit');
    expect(leadsRoute).toContain('isLikelySpamLead');
    expect(funnelRoute).toContain('await checkAgencyFunnelEventRateLimit');
    expect(funnelHelper).toContain('Ratelimit.slidingWindow(EVENT_LIMIT, EVENT_UPSTASH_WINDOW)');
    expect(funnelHelper).toContain('buildAgencyFunnelEventRateLimitKey');
  });

  it('keeps public contact and waitlist routes protected by the shared public-form limiter', () => {
    const contactRoute = read('app/api/contact/route.ts');
    const waitlistRoute = read('app/api/waitlist/route.ts');
    const publicFormLimiter = read('lib/public-form-rate-limit.ts');

    expect(contactRoute).toContain("route: 'contact'");
    expect(contactRoute).toContain('checkPublicFormRateLimit');
    expect(waitlistRoute).toContain("route: 'waitlist'");
    expect(waitlistRoute).toContain('checkPublicFormRateLimit');
    expect(publicFormLimiter).toContain('Ratelimit.slidingWindow(config.max, config.upstashWindow)');
    expect(publicFormLimiter).toContain('buildPublicFormRateLimitKey');
  });

  it('keeps expensive upload, import, and AI routes on durable limiters', () => {
    const uploadInitRoute = read('app/api/upload/init/route.ts');
    const uploadUrlRoute = read('app/api/upload/url/route.ts');
    const transcribeRoute = read('app/api/transcribe/route.ts');
    const generateContentRoute = read('app/api/generate-content/route.ts');
    const strictJsonRoute = read('app/api/strict-json-content/route.ts');
    const slackImportRoute = read('app/api/agency/slack/import/route.ts');
    const granolaImportRoute = read('app/api/agency/granola/imports/route.ts');
    const agencyDraftRoute = read('app/api/agency/source-imports/[id]/generate/route.ts');

    expect(uploadInitRoute).toContain('uploadRatelimit.limit(user.id)');
    expect(uploadUrlRoute).toContain('uploadRatelimit.limit(user.id)');
    expect(transcribeRoute).toContain('aiRatelimit.limit(callerUserId)');
    expect(generateContentRoute).toContain('aiRatelimit.limit(userId)');
    expect(strictJsonRoute).toContain('aiRatelimit.limit(authenticatedUserId)');
    expect(slackImportRoute).toContain('uploadRatelimit.limit(user.id)');
    expect(granolaImportRoute).toContain('uploadRatelimit.limit(user.id)');
    expect(agencyDraftRoute).toContain('aiRatelimit.limit(user.id)');
  });
});
