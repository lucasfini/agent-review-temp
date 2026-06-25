#!/usr/bin/env node

const dotenv = require('dotenv');

const REQUIRED_ENV = [
  'NEXT_PUBLIC_APP_URL',
  'NEXT_PUBLIC_SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'STRIPE_SECRET_KEY',
  'NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY',
  'STRIPE_WEBHOOK_SECRET',
];

const RECOMMENDED_ENV = [
  'STRIPE_SUBSCRIPTION_SUCCESS_URL',
  'STRIPE_SUBSCRIPTION_CANCEL_URL',
  'STRIPE_BILLING_PORTAL_RETURN_URL',
];

function isFilled(value) {
  return typeof value === 'string'
    && value.trim().length > 0
    && !value.toLowerCase().includes('replace-me');
}

function loadEnvFiles() {
  dotenv.config({ path: '.env.local', quiet: true });
  dotenv.config({ quiet: true });
}

function normalizeEnforcementMode(value) {
  if (value === 'enforce') return 'enforce';
  return 'dry_run';
}

function collectStaticChecks(env = process.env) {
  const missingRequiredEnv = REQUIRED_ENV.filter((key) => !isFilled(env[key]));
  const missingRecommendedEnv = RECOMMENDED_ENV.filter((key) => !isFilled(env[key]));
  const rawEnforcementMode = env.SUBSCRIPTION_ENFORCEMENT_MODE;
  const enforcementMode = normalizeEnforcementMode(rawEnforcementMode);
  const invalidEnforcementMode = isFilled(rawEnforcementMode)
    && rawEnforcementMode !== 'dry_run'
    && rawEnforcementMode !== 'enforce';

  return {
    missingRequiredEnv,
    missingRecommendedEnv,
    rawEnforcementMode: rawEnforcementMode || '(unset)',
    enforcementMode,
    invalidEnforcementMode,
  };
}

function summarizePlanRows(rows) {
  const activePlans = Array.isArray(rows)
    ? rows.filter((row) => row && row.is_active !== false)
    : [];
  const activePlansMissingStripePrice = activePlans
    .filter((row) => row.slug !== 'free')
    .filter((row) => !isFilled(row.stripe_monthly_price_id || row.stripe_price_id) || !isFilled(row.stripe_annual_price_id))
    .map((row) => row.slug || row.id || '(unknown)');

  return {
    activePlanCount: activePlans.length,
    activePlansMissingStripePrice,
  };
}

function summarizeSubscriptionRows(rows) {
  const subscriptions = Array.isArray(rows) ? rows : [];
  const usableSubscriptions = subscriptions.filter((row) => (
    row?.status === 'active' || row?.status === 'trialing'
  ));

  return {
    subscriptionCount: subscriptions.length,
    usableSubscriptionCount: usableSubscriptions.length,
    statuses: [...new Set(subscriptions.map((row) => row?.status).filter(Boolean))],
  };
}

function printSection(title, items) {
  console.log(`\n${title}`);
  for (const item of items) {
    console.log(`- ${item}`);
  }
}

async function loadReadOnlyDatabaseChecks(options = {}) {
  const env = options.env || process.env;
  if (!isFilled(env.NEXT_PUBLIC_SUPABASE_URL) || !isFilled(env.SUPABASE_SERVICE_ROLE_KEY)) {
    return {
      skipped: true,
      reason: 'Supabase URL or service role key is missing.',
    };
  }

  const { createClient } = require('@supabase/supabase-js');
  const supabase = createClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    }
  );

  const planResult = await supabase
    .from('plans')
    .select('id, slug, name, is_active, stripe_price_id, stripe_monthly_price_id, stripe_annual_price_id')
    .eq('is_active', true)
    .order('display_order', { ascending: true });

  if (planResult.error) {
    throw new Error(planResult.error.message || 'Failed to read plans');
  }

  let subscriptionSummary = null;
  if (isFilled(options.organizationId)) {
    const subscriptionResult = await supabase
      .from('organization_subscriptions')
      .select('id, organization_id, status, stripe_customer_id, stripe_subscription_id, plan_id')
      .eq('organization_id', options.organizationId)
      .order('created_at', { ascending: false });

    if (subscriptionResult.error) {
      throw new Error(subscriptionResult.error.message || 'Failed to read organization subscriptions');
    }

    subscriptionSummary = summarizeSubscriptionRows(subscriptionResult.data || []);
  }

  let usageCounterTableReadable = false;
  let usageCounterCount = null;
  if (isFilled(options.organizationId)) {
    const counterResult = await supabase
      .from('subscription_usage_counters')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', options.organizationId);

    if (counterResult.error) {
      throw new Error(counterResult.error.message || 'Failed to read subscription usage counters');
    }

    usageCounterTableReadable = true;
    usageCounterCount = counterResult.count || 0;
  } else {
    const counterResult = await supabase
      .from('subscription_usage_counters')
      .select('id', { count: 'exact', head: true })
      .limit(1);

    if (!counterResult.error) {
      usageCounterTableReadable = true;
    }
  }

  return {
    skipped: false,
    plans: summarizePlanRows(planResult.data || []),
    subscriptionSummary,
    usageCounterTableReadable,
    usageCounterCount,
  };
}

function parseArgs(argv) {
  const args = {
    organizationId: null,
    skipDb: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (item === '--organization-id') {
      args.organizationId = argv[index + 1] || null;
      index += 1;
    } else if (item.startsWith('--organization-id=')) {
      args.organizationId = item.slice('--organization-id='.length);
    } else if (item === '--skip-db') {
      args.skipDb = true;
    }
  }

  return args;
}

async function runCli(argv = process.argv.slice(2), env = process.env) {
  const args = parseArgs(argv);
  const staticChecks = collectStaticChecks(env);
  const failures = [];
  const warnings = [];

  if (staticChecks.missingRequiredEnv.length) {
    failures.push(`Missing required env vars: ${staticChecks.missingRequiredEnv.join(', ')}`);
  }
  if (staticChecks.invalidEnforcementMode) {
    warnings.push(`Invalid SUBSCRIPTION_ENFORCEMENT_MODE (${staticChecks.rawEnforcementMode}); app will use dry_run.`);
  }
  if (staticChecks.missingRecommendedEnv.length) {
    warnings.push(`Missing recommended env vars: ${staticChecks.missingRecommendedEnv.join(', ')}`);
  }

  console.log('Subscription launch readiness check');
  console.log(`Enforcement mode: ${staticChecks.enforcementMode} (raw: ${staticChecks.rawEnforcementMode})`);
  if (args.organizationId) {
    console.log(`Organization scope: ${args.organizationId}`);
  } else {
    console.log('Organization scope: not provided');
  }

  if (args.skipDb) {
    warnings.push('Database checks skipped by --skip-db.');
  } else if (!staticChecks.missingRequiredEnv.length) {
    try {
      const databaseChecks = await loadReadOnlyDatabaseChecks({
        env,
        organizationId: args.organizationId,
      });

      if (databaseChecks.skipped) {
        warnings.push(`Database checks skipped: ${databaseChecks.reason}`);
      } else {
        if (databaseChecks.plans.activePlanCount === 0) {
          failures.push('No active subscription plans found.');
        }
        if (databaseChecks.plans.activePlansMissingStripePrice.length) {
          failures.push(`Active plans missing Stripe price IDs: ${databaseChecks.plans.activePlansMissingStripePrice.join(', ')}`);
        }
        if (!databaseChecks.usageCounterTableReadable) {
          failures.push('subscription_usage_counters table is not readable.');
        }
        if (args.organizationId && databaseChecks.subscriptionSummary?.subscriptionCount === 0) {
          warnings.push('No subscription rows found for the provided organization.');
        }

        printSection('Read-only database checks', [
          `Active plans: ${databaseChecks.plans.activePlanCount}`,
          `Usage counter table readable: ${databaseChecks.usageCounterTableReadable ? 'yes' : 'no'}`,
          args.organizationId
            ? `Organization subscriptions: ${databaseChecks.subscriptionSummary?.subscriptionCount || 0}`
            : 'Organization subscription check skipped; pass --organization-id to enable it',
          args.organizationId
            ? `Organization usage counters: ${databaseChecks.usageCounterCount}`
            : 'Organization usage counter count skipped; pass --organization-id to enable it',
        ]);
      }
    } catch (error) {
      failures.push(`Database checks failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  if (warnings.length) {
    printSection('Warnings', warnings);
  }

  if (failures.length) {
    printSection('Failures', failures);
    process.exitCode = 1;
    return { ok: false, failures, warnings };
  }

  console.log('\nReadiness check passed.');
  return { ok: true, failures, warnings };
}

if (require.main === module) {
  loadEnvFiles();
  runCli().catch((error) => {
    console.error('Subscription launch readiness check failed.');
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}

module.exports = {
  REQUIRED_ENV,
  RECOMMENDED_ENV,
  collectStaticChecks,
  isFilled,
  loadEnvFiles,
  loadReadOnlyDatabaseChecks,
  normalizeEnforcementMode,
  parseArgs,
  runCli,
  summarizePlanRows,
  summarizeSubscriptionRows,
};
