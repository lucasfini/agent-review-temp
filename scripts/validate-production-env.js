#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

const REQUIRED_ENV = [
  'APP_DOMAIN',
  'NEXT_PUBLIC_APP_URL',
  'ACME_EMAIL',
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'STRIPE_SECRET_KEY',
  'NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY',
  'STRIPE_WEBHOOK_SECRET',
  'RESEND_API_KEY',
  'OPENAI_API_KEY',
  'R2_ACCOUNT_ID',
  'R2_ACCESS_KEY_ID',
  'R2_SECRET_ACCESS_KEY',
  'R2_BUCKET_NAME',
  'UPSTASH_REDIS_REST_URL',
  'UPSTASH_REDIS_REST_TOKEN',
  'CRON_SECRET',
  'INTERNAL_JOB_SECRET',
  'UPLOAD_TOKEN_SECRET',
  'SUBSCRIPTION_ENFORCEMENT_MODE',
];

const REQUIRED_ANY_GROUPS = [
  {
    label: 'ASSEMBLYAI_API_KEY or ASSEMBLYAI_ACCESS_KEY',
    keys: ['ASSEMBLYAI_API_KEY', 'ASSEMBLYAI_ACCESS_KEY'],
  },
];

const RECOMMENDED_ENV = [
  'CONTACT_FROM_EMAIL',
  'CONTACT_TO_EMAIL',
  'ADMIN_EMAILS',
  'STRIPE_SUBSCRIPTION_SUCCESS_URL',
  'STRIPE_SUBSCRIPTION_CANCEL_URL',
  'STRIPE_BILLING_PORTAL_RETURN_URL',
];

const OPTIONAL_ENV = [
  'INTERNAL_APP_URL',
  'AGENCY_LEAD_FROM_EMAIL',
  'AGENCY_LEAD_NOTIFICATION_EMAIL',
  'AGENCY_LEAD_ORGANIZATION_ID',
  'SLACK_CLIENT_ID',
  'SLACK_CLIENT_SECRET',
  'SLACK_REDIRECT_URI',
  'SLACK_OAUTH_STATE_SECRET',
  'SLACK_SIGNING_SECRET',
  'INTEGRATIONS_ENCRYPTION_KEY',
  'ANTHROPIC_API_KEY',
  'PERPLEXITY_API_KEY',
  'GOOGLE_API_KEY',
  'DEEPGRAM_API_KEY',
  'ZOOM_CLIENT_ID',
  'ZOOM_CLIENT_SECRET',
  'ZOOM_REDIRECT_URI',
  'MS_CLIENT_ID',
  'MS_CLIENT_SECRET',
  'MS_TENANT_ID',
  'MS_REDIRECT_URI',
  'GOOGLE_OAUTH_CLIENT_ID',
  'GOOGLE_OAUTH_CLIENT_SECRET',
  'YOUTUBE_REDIRECT_URI',
  'STARTER_PROJECT_TEMPLATE_ID',
  'PIPELINE_DOC_ALLOWED_EMAILS',
  'NEXT_PUBLIC_PIPELINE_DOC_ALLOWED_EMAILS',
  'PERFORMANCE_LEVEL',
  'NEXT_PUBLIC_SAVE_EXPORT_LOCALLY',
];

const DEFAULT_ENV_FILES = ['.env.production', '.env.local', '.env'];

function normalizeValue(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function isPresent(value) {
  return normalizeValue(value).length > 0;
}

function isPlaceholderValue(value) {
  const normalized = normalizeValue(value).toLowerCase();
  if (!normalized) return false;

  return [
    'replace-me',
    'replace_with',
    'replace-with',
    'changeme',
    'change-me',
    'placeholder',
    'todo',
    'tbd',
    '<',
    '>',
    'your-project.supabase.co',
    'your-',
  ].some((marker) => normalized.includes(marker));
}

function isUsableValue(value) {
  return isPresent(value) && !isPlaceholderValue(value);
}

function normalizeEnforcementMode(value) {
  return normalizeValue(value) === 'enforce' ? 'enforce' : 'dry_run';
}

function validateRequiredKeys(env, keys) {
  const missing = [];
  const placeholders = [];

  for (const key of keys) {
    if (!isPresent(env[key])) {
      missing.push(key);
    } else if (isPlaceholderValue(env[key])) {
      placeholders.push(key);
    }
  }

  return { missing, placeholders };
}

function validateAnyGroups(env, groups) {
  const missing = [];
  const placeholders = [];

  for (const group of groups) {
    const usableKeys = group.keys.filter((key) => isUsableValue(env[key]));
    if (usableKeys.length > 0) continue;

    const presentPlaceholderKeys = group.keys.filter((key) => isPlaceholderValue(env[key]));
    if (presentPlaceholderKeys.length > 0) {
      placeholders.push(group.label);
    } else {
      missing.push(group.label);
    }
  }

  return { missing, placeholders };
}

function validateRequiredTogether(env, keys) {
  const usableCount = keys.filter((key) => isUsableValue(env[key])).length;
  if (usableCount === 0 || usableCount === keys.length) return null;
  return `Set all of ${keys.join(', ')} together`;
}

function validateOptionalCredentials(env, keys) {
  const credentialKeys = keys.slice(0, -1);
  const anyCredentialConfigured = credentialKeys.some((key) => isPresent(env[key]));
  if (!anyCredentialConfigured) return null;

  const unusable = keys.filter((key) => !isUsableValue(env[key]));
  if (!unusable.length) return null;
  return `Set usable values for ${keys.join(', ')} or leave the credentials blank`;
}

function validateIntegrationEncryptionKey(value) {
  if (!isUsableValue(value)) return null;

  const trimmed = normalizeValue(value);
  if (/^[0-9a-fA-F]{64}$/.test(trimmed)) return null;

  try {
    const decoded = Buffer.from(trimmed, 'base64');
    if (decoded.length === 32) return null;
  } catch {
    // Fall through to the generic error below.
  }

  return 'INTEGRATIONS_ENCRYPTION_KEY must be 32 bytes as base64 or 64 hex characters';
}

function collectProductionEnvChecks(env = process.env) {
  const requiredKeys = validateRequiredKeys(env, REQUIRED_ENV);
  const requiredGroups = validateAnyGroups(env, REQUIRED_ANY_GROUPS);
  const missingRecommendedEnv = RECOMMENDED_ENV.filter((key) => !isUsableValue(env[key]));
  const configurationErrors = [
    validateRequiredTogether(env, ['UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN']),
    validateOptionalCredentials(env, ['SLACK_CLIENT_ID', 'SLACK_CLIENT_SECRET', 'SLACK_REDIRECT_URI']),
    validateOptionalCredentials(env, ['ZOOM_CLIENT_ID', 'ZOOM_CLIENT_SECRET', 'ZOOM_REDIRECT_URI']),
    validateOptionalCredentials(env, ['MS_CLIENT_ID', 'MS_CLIENT_SECRET', 'MS_REDIRECT_URI']),
    validateOptionalCredentials(env, ['GOOGLE_OAUTH_CLIENT_ID', 'GOOGLE_OAUTH_CLIENT_SECRET', 'YOUTUBE_REDIRECT_URI']),
    validateIntegrationEncryptionKey(env.INTEGRATIONS_ENCRYPTION_KEY),
  ].filter(Boolean);

  const rawEnforcementMode = env.SUBSCRIPTION_ENFORCEMENT_MODE;
  const enforcementMode = normalizeEnforcementMode(rawEnforcementMode);
  const trimmedMode = normalizeValue(rawEnforcementMode);
  if (isPresent(rawEnforcementMode) && trimmedMode !== 'dry_run' && trimmedMode !== 'enforce') {
    configurationErrors.push('SUBSCRIPTION_ENFORCEMENT_MODE must be dry_run or enforce');
  }

  const warnings = [];
  if (enforcementMode === 'enforce') {
    warnings.push('SUBSCRIPTION_ENFORCEMENT_MODE is enforce; only use after explicit launch approval.');
  }
  if (env.SLACK_SIGNING_SECRET && isUsableValue(env.SLACK_SIGNING_SECRET)) {
    warnings.push('SLACK_SIGNING_SECRET is set, but no Slack event signature route is currently enabled.');
  }
  if (missingRecommendedEnv.length) {
    warnings.push(`Recommended env vars missing or placeholder: ${missingRecommendedEnv.join(', ')}`);
  }

  return {
    missingRequiredEnv: [...requiredKeys.missing, ...requiredGroups.missing],
    placeholderRequiredEnv: [...requiredKeys.placeholders, ...requiredGroups.placeholders],
    missingRecommendedEnv,
    configurationErrors,
    warnings,
    rawEnforcementMode: rawEnforcementMode || '(unset)',
    enforcementMode,
  };
}

function parseArgs(argv) {
  const args = {
    envFile: null,
    envFileRequested: false,
    noDefaultFiles: false,
    help: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (item === '--help' || item === '-h') {
      args.help = true;
    } else if (item === '--no-default-env') {
      args.noDefaultFiles = true;
    } else if (item === '--env-file') {
      args.envFileRequested = true;
      args.envFile = argv[index + 1] || null;
      index += 1;
    } else if (item.startsWith('--env-file=')) {
      args.envFileRequested = true;
      args.envFile = item.slice('--env-file='.length);
    }
  }

  return args;
}

function loadEnvFile(filePath) {
  const resolvedPath = path.resolve(process.cwd(), filePath);
  if (!fs.existsSync(resolvedPath)) {
    return false;
  }

  dotenv.config({ path: resolvedPath, quiet: true });
  return true;
}

function loadEnvFiles(options = {}) {
  const loaded = [];

  if (options.envFile) {
    if (loadEnvFile(options.envFile)) loaded.push(options.envFile);
    return loaded;
  }

  if (options.noDefaultFiles) return loaded;

  for (const file of DEFAULT_ENV_FILES) {
    if (loadEnvFile(file)) loaded.push(file);
  }

  return loaded;
}

function printSection(title, items, writer = console.log) {
  if (!items.length) return;
  writer(`\n${title}`);
  for (const item of items) {
    writer(`- ${item}`);
  }
}

function printHelp() {
  console.log(`Validate production environment configuration without printing secret values.

Usage:
  npm run validate:production-env
  npm run validate:production-env -- --env-file .env.production
  npm run validate:production-env -- --env-file .env.production.example

Options:
  --env-file <path>     Load one env file before validation.
  --no-default-env      Do not auto-load .env.production, .env.local, or .env.
  -h, --help            Show this help text.`);
}

async function runCli(argv = process.argv.slice(2), env = process.env) {
  const args = parseArgs(argv);
  if (args.help) {
    printHelp();
    return { ok: true, failures: [], warnings: [] };
  }

  const loadedFiles = loadEnvFiles(args);
  const report = collectProductionEnvChecks(env);
  const failures = [];

  if (args.envFileRequested && !loadedFiles.length) {
    failures.push(`Env file not found: ${args.envFile || '(missing path)'}`);
  }
  if (report.missingRequiredEnv.length) {
    failures.push(`Missing required env vars: ${report.missingRequiredEnv.join(', ')}`);
  }
  if (report.placeholderRequiredEnv.length) {
    failures.push(`Placeholder required env vars: ${report.placeholderRequiredEnv.join(', ')}`);
  }
  failures.push(...report.configurationErrors);

  console.log('Production env validation');
  if (loadedFiles.length) {
    console.log(`Loaded env files: ${loadedFiles.join(', ')}`);
  } else {
    console.log('Loaded env files: none');
  }
  console.log(`Subscription enforcement mode: ${report.enforcementMode} (raw: ${report.rawEnforcementMode})`);

  printSection('Warnings', report.warnings, console.warn);

  if (failures.length) {
    printSection('Failures', failures, console.error);
    process.exitCode = 1;
    return { ok: false, failures, warnings: report.warnings };
  }

  console.log('\nProduction env validation passed.');
  return { ok: true, failures, warnings: report.warnings };
}

if (require.main === module) {
  runCli().catch((error) => {
    console.error('Production env validation failed.');
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}

module.exports = {
  DEFAULT_ENV_FILES,
  OPTIONAL_ENV,
  RECOMMENDED_ENV,
  REQUIRED_ANY_GROUPS,
  REQUIRED_ENV,
  collectProductionEnvChecks,
  isPlaceholderValue,
  isPresent,
  isUsableValue,
  loadEnvFiles,
  normalizeEnforcementMode,
  parseArgs,
  runCli,
  validateIntegrationEncryptionKey,
  validateOptionalCredentials,
  validateRequiredKeys,
  validateRequiredTogether,
};
