const required = [
  'APP_DOMAIN',
  'NEXT_PUBLIC_APP_URL',
  'ACME_EMAIL',
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'ANTHROPIC_API_KEY',
  'OPENAI_API_KEY_OPTIN',
  'STRIPE_SECRET_KEY',
  'NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY',
  'STRIPE_WEBHOOK_SECRET',
  'R2_ACCOUNT_ID',
  'R2_ACCESS_KEY_ID',
  'R2_SECRET_ACCESS_KEY',
  'R2_BUCKET_NAME',
  'CRON_SECRET',
  'INTERNAL_JOB_SECRET',
  'UPLOAD_TOKEN_SECRET',
];

const recommended = [
  'UPSTASH_REDIS_REST_URL',
  'UPSTASH_REDIS_REST_TOKEN',
  'ADMIN_EMAILS',
];

function isFilled(value) {
  return typeof value === 'string' && value.trim().length > 0 && !value.includes('replace-me');
}

function validatePair(env, [a, b]) {
  const aFilled = isFilled(env[a]);
  const bFilled = isFilled(env[b]);

  if (aFilled !== bFilled) {
    return `Both ${a} and ${b} must be set together`;
  }

  return null;
}

function main() {
  const assemblyAiConfigured =
    isFilled(process.env.ASSEMBLYAI_API_KEY) || isFilled(process.env.ASSEMBLYAI_ACCESS_KEY);
  const missing = required.filter((key) => !isFilled(process.env[key]));
  const warnings = recommended.filter((key) => !isFilled(process.env[key]));
  const pairErrors = [
    validatePair(process.env, ['UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN']),
    validatePair(process.env, ['ZOOM_CLIENT_ID', 'ZOOM_CLIENT_SECRET']),
    validatePair(process.env, ['MS_CLIENT_ID', 'MS_CLIENT_SECRET']),
  ].filter(Boolean);

  if (!assemblyAiConfigured) {
    missing.push('ASSEMBLYAI_API_KEY or ASSEMBLYAI_ACCESS_KEY');
  }

  if (missing.length || pairErrors.length) {
    console.error('Production env validation failed.\n');

    if (missing.length) {
      console.error('Missing required variables:');
      for (const key of missing) {
        console.error(`- ${key}`);
      }
      console.error('');
    }

    if (pairErrors.length) {
      console.error('Configuration errors:');
      for (const error of pairErrors) {
        console.error(`- ${error}`);
      }
      console.error('');
    }

    process.exit(1);
  }

  console.log('Production env validation passed.');

  if (warnings.length) {
    console.warn('\nRecommended but missing:');
    for (const key of warnings) {
      console.warn(`- ${key}`);
    }
  }
}

main();
