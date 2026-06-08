const {
  collectProductionEnvChecks,
  isPlaceholderValue,
  normalizeEnforcementMode,
  parseArgs,
  runCli,
  validateIntegrationEncryptionKey,
} = require('../../scripts/validate-production-env.js');

const validEncryptionKey = Buffer.alloc(32, 1).toString('base64');

function completeEnv(overrides = {}) {
  return {
    APP_DOMAIN: 'audiorepurpose.com',
    NEXT_PUBLIC_APP_URL: 'https://audiorepurpose.com',
    ACME_EMAIL: 'ops@audiorepurpose.com',
    NEXT_PUBLIC_SUPABASE_URL: 'https://prod.supabase.co',
    NEXT_PUBLIC_SUPABASE_ANON_KEY: 'supabase-anon-key',
    SUPABASE_SERVICE_ROLE_KEY: 'supabase-service-role-value',
    STRIPE_SECRET_KEY: 'stripe-secret-key-value',
    NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: 'stripe-publishable-key-value',
    STRIPE_WEBHOOK_SECRET: 'stripe-webhook-secret-value',
    RESEND_API_KEY: 'resend-api-key-value',
    AGENCY_LEAD_FROM_EMAIL: 'leads@audiorepurpose.com',
    AGENCY_LEAD_NOTIFICATION_EMAIL: 'ops@audiorepurpose.com',
    AGENCY_LEAD_ORGANIZATION_ID: 'agency-org-id',
    SLACK_CLIENT_ID: 'slack-client-id',
    SLACK_CLIENT_SECRET: 'slack-client-secret-value',
    SLACK_REDIRECT_URI: 'https://audiorepurpose.com/api/agency/slack/oauth/callback',
    INTEGRATIONS_ENCRYPTION_KEY: validEncryptionKey,
    OPENAI_API_KEY: 'openai-key-value',
    ASSEMBLYAI_API_KEY: 'assemblyai-key-value',
    R2_ACCOUNT_ID: 'r2-account-id',
    R2_ACCESS_KEY_ID: 'r2-access-key-id',
    R2_SECRET_ACCESS_KEY: 'r2-secret-access-key-value',
    R2_BUCKET_NAME: 'audiorepurpose-audio',
    UPSTASH_REDIS_REST_URL: 'https://upstash.example.com',
    UPSTASH_REDIS_REST_TOKEN: 'upstash-token-value',
    CRON_SECRET: 'cron-secret-value',
    INTERNAL_JOB_SECRET: 'internal-job-secret-value',
    UPLOAD_TOKEN_SECRET: 'upload-token-secret-value',
    SUBSCRIPTION_ENFORCEMENT_MODE: 'dry_run',
    CONTACT_FROM_EMAIL: 'support@audiorepurpose.com',
    CONTACT_TO_EMAIL: 'support@audiorepurpose.com',
    ADMIN_EMAILS: 'admin@audiorepurpose.com',
    STRIPE_SUBSCRIPTION_SUCCESS_URL: 'https://audiorepurpose.com/dashboard/billing?checkout=success',
    STRIPE_SUBSCRIPTION_CANCEL_URL: 'https://audiorepurpose.com/dashboard/billing?checkout=cancelled',
    STRIPE_BILLING_PORTAL_RETURN_URL: 'https://audiorepurpose.com/dashboard/billing',
    ...overrides,
  };
}

describe('production env validator', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    process.exitCode = undefined;
  });

  it('passes a complete production env without reporting secret values', async () => {
    const env = completeEnv();
    const output = [];
    jest.spyOn(console, 'log').mockImplementation((message = '') => output.push(String(message)));
    jest.spyOn(console, 'warn').mockImplementation((message = '') => output.push(String(message)));
    jest.spyOn(console, 'error').mockImplementation((message = '') => output.push(String(message)));

    const result = await runCli(['--no-default-env'], env);

    expect(result.ok).toBe(true);
    expect(output.join('\n')).not.toContain(env.STRIPE_SECRET_KEY);
    expect(output.join('\n')).not.toContain(env.SUPABASE_SERVICE_ROLE_KEY);
    expect(output.join('\n')).not.toContain(env.INTEGRATIONS_ENCRYPTION_KEY);
  });

  it('reports missing and placeholder required env values separately', () => {
    const report = collectProductionEnvChecks(completeEnv({
      OPENAI_API_KEY: 'replace-with-your-openai-api-key',
      NEXT_PUBLIC_SUPABASE_URL: 'https://your-project.supabase.co',
      AGENCY_LEAD_ORGANIZATION_ID: '',
    }));

    expect(report.placeholderRequiredEnv).toEqual(expect.arrayContaining([
      'NEXT_PUBLIC_SUPABASE_URL',
      'OPENAI_API_KEY',
    ]));
    expect(report.missingRequiredEnv).toContain('AGENCY_LEAD_ORGANIZATION_ID');
  });

  it('requires one AssemblyAI credential and validates paired provider config', () => {
    const report = collectProductionEnvChecks(completeEnv({
      ASSEMBLYAI_API_KEY: '',
      ASSEMBLYAI_ACCESS_KEY: '',
      UPSTASH_REDIS_REST_TOKEN: '',
    }));

    expect(report.missingRequiredEnv).toContain('ASSEMBLYAI_API_KEY or ASSEMBLYAI_ACCESS_KEY');
    expect(report.missingRequiredEnv).toContain('UPSTASH_REDIS_REST_TOKEN');
    expect(report.configurationErrors).toContain('Set all of UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN together');
  });

  it('validates integration encryption key formats', () => {
    expect(validateIntegrationEncryptionKey(validEncryptionKey)).toBeNull();
    expect(validateIntegrationEncryptionKey('a'.repeat(64))).toBeNull();
    expect(validateIntegrationEncryptionKey('too-short')).toBe('INTEGRATIONS_ENCRYPTION_KEY must be 32 bytes as base64 or 64 hex characters');
  });

  it('normalizes subscription enforcement mode and flags unsafe values', () => {
    expect(normalizeEnforcementMode(undefined)).toBe('dry_run');
    expect(normalizeEnforcementMode('dry_run')).toBe('dry_run');
    expect(normalizeEnforcementMode('enforce')).toBe('enforce');
    expect(normalizeEnforcementMode('ENFORCE')).toBe('dry_run');

    const invalid = collectProductionEnvChecks(completeEnv({ SUBSCRIPTION_ENFORCEMENT_MODE: 'ENFORCE' }));
    expect(invalid.configurationErrors).toContain('SUBSCRIPTION_ENFORCEMENT_MODE must be dry_run or enforce');
  });

  it('parses env-file and default-loading arguments', () => {
    expect(parseArgs(['--env-file', '.env.production'])).toEqual({
      envFile: '.env.production',
      envFileRequested: true,
      help: false,
      noDefaultFiles: false,
    });
    expect(parseArgs(['--env-file=.env.production.example', '--no-default-env'])).toEqual({
      envFile: '.env.production.example',
      envFileRequested: true,
      help: false,
      noDefaultFiles: true,
    });
  });

  it('fails when an explicit env file path does not exist', async () => {
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});

    const result = await runCli(['--env-file', 'missing-production-env-file'], completeEnv());

    expect(result.ok).toBe(false);
    expect(result.failures).toContain('Env file not found: missing-production-env-file');
  });

  it('identifies known placeholder markers', () => {
    expect(isPlaceholderValue('replace-with-your-secret')).toBe(true);
    expect(isPlaceholderValue('https://your-project.supabase.co')).toBe(true);
    expect(isPlaceholderValue('real-secret-value')).toBe(false);
  });
});
