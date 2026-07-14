#!/usr/bin/env node

const dotenv = require('dotenv');
const { createClient } = require('@supabase/supabase-js');

dotenv.config({ path: '.env.local', quiet: true });
dotenv.config({ path: '.env', quiet: true });

function argValue(name) {
  const prefix = `${name}=`;
  const match = process.argv.find((arg) => arg.startsWith(prefix));
  if (match) return match.slice(prefix.length);
  const index = process.argv.indexOf(name);
  if (index >= 0) return process.argv[index + 1] || null;
  return null;
}

function hasFlag(name) {
  return process.argv.includes(name);
}

function usage() {
  console.log([
    'Usage:',
    '  node scripts/reconcile-duplicate-plan-grants.js --organization-id <org-id> [--keep active-plan|earliest|latest|plan:<slug>] [--apply]',
    '',
    'Default is dry-run. Only duplicate plan_grant rows in the same subscription period are adjusted.',
  ].join('\n'));
}

function normalizeMetadata(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function groupKey(grant) {
  if (!grant.subscription_id || !grant.period_start || !grant.period_end) return null;
  return [grant.subscription_id, grant.period_start, grant.period_end].join(':');
}

function grantPlanSlug(grant) {
  const metadata = normalizeMetadata(grant.metadata_json);
  return typeof metadata.planSlug === 'string' ? metadata.planSlug : null;
}

function chooseKeeper(grants, subscription, keepMode) {
  const sorted = [...grants].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

  if (keepMode.startsWith('plan:')) {
    const slug = keepMode.slice('plan:'.length);
    return sorted.find((grant) => grantPlanSlug(grant) === slug) || sorted[0];
  }

  if (keepMode === 'latest') {
    return sorted[sorted.length - 1];
  }

  if (keepMode === 'active-plan') {
    const activePlanId = subscription?.plan_id || null;
    const activePlanSlug = subscription?.plan?.slug || null;
    return sorted.find((grant) => (
      (activePlanId && grant.plan_id === activePlanId)
      || (activePlanSlug && grantPlanSlug(grant) === activePlanSlug)
    )) || sorted[0];
  }

  return sorted[0];
}

async function main() {
  const organizationId = argValue('--organization-id') || argValue('--org');
  const keepMode = argValue('--keep') || 'active-plan';
  const apply = hasFlag('--apply');

  if (hasFlag('--help') || hasFlag('-h')) {
    usage();
    process.exit(0);
  }

  if (!organizationId) {
    usage();
    process.exit(1);
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.');
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  const { data: subscriptions, error: subscriptionError } = await supabase
    .from('organization_subscriptions')
    .select('*, plan:plans(*)')
    .eq('organization_id', organizationId)
    .order('updated_at', { ascending: false });

  if (subscriptionError) {
    throw new Error(subscriptionError.message || 'Failed to load organization subscriptions');
  }

  const subscription = (subscriptions || []).find((row) => row.status === 'active' || row.status === 'trialing')
    || (subscriptions || [])[0]
    || null;

  const nowIso = new Date().toISOString();
  const { data: grants, error: grantsError } = await supabase
    .from('billing_credit_grants')
    .select('*')
    .eq('organization_id', organizationId)
    .eq('source_type', 'plan_grant')
    .gt('credits_remaining', 0)
    .gt('expires_at', nowIso)
    .order('created_at', { ascending: true });

  if (grantsError) {
    throw new Error(grantsError.message || 'Failed to load billing credit grants');
  }

  const groups = new Map();
  for (const grant of grants || []) {
    const key = groupKey(grant);
    if (!key) continue;
    const rows = groups.get(key) || [];
    rows.push(grant);
    groups.set(key, rows);
  }

  const duplicateGroups = Array.from(groups.values()).filter((rows) => rows.length > 1);
  const changes = [];

  for (const rows of duplicateGroups) {
    const keeper = chooseKeeper(rows, subscription, keepMode);
    for (const grant of rows) {
      if (grant.id === keeper.id) continue;
      changes.push({
        grant,
        keeper,
      });
    }
  }

  console.log(JSON.stringify({
    organizationId,
    mode: apply ? 'apply' : 'dry-run',
    keepMode,
    activeSubscription: subscription ? {
      id: subscription.id,
      planId: subscription.plan_id,
      planSlug: subscription.plan?.slug || null,
      status: subscription.status,
    } : null,
    duplicateGroups: duplicateGroups.length,
    grantsToExpire: changes.map(({ grant, keeper }) => ({
      id: grant.id,
      planId: grant.plan_id,
      planSlug: grantPlanSlug(grant),
      creditsRemaining: Number(grant.credits_remaining || 0),
      periodStart: grant.period_start,
      periodEnd: grant.period_end,
      keepingGrantId: keeper.id,
    })),
  }, null, 2));

  if (!apply || changes.length === 0) {
    return;
  }

  for (const { grant, keeper } of changes) {
    const metadata = {
      ...normalizeMetadata(grant.metadata_json),
      duplicatePlanGrantCleanup: {
        cleanedAt: nowIso,
        keptGrantId: keeper.id,
        previousCreditsRemaining: Number(grant.credits_remaining || 0),
      },
    };

    const { error } = await supabase
      .from('billing_credit_grants')
      .update({
        credits_remaining: 0,
        expires_at: nowIso,
        metadata_json: metadata,
      })
      .eq('id', grant.id);

    if (error) {
      throw new Error(error.message || `Failed to expire duplicate grant ${grant.id}`);
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
