const { readFileSync } = require('fs');
const path = require('path');

const sqlPath = path.join(process.cwd(), 'scripts/sql/verify-rls-launch-readiness.sql');
const reportPath = path.join(process.cwd(), 'PHASE_8B_SUPABASE_RLS_VERIFICATION.md');

const sql = readFileSync(sqlPath, 'utf8');
const report = readFileSync(reportPath, 'utf8');

function stripSqlCommentsAndStrings(input) {
  return input
    .replace(/--.*$/gm, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/'(?:''|[^'])*'/g, "''");
}

describe('Phase 8B RLS launch verification artifacts', () => {
  it('keeps the SQL verification script read-only', () => {
    const executableSql = stripSqlCommentsAndStrings(sql);

    expect(executableSql).not.toMatch(/\b(insert|update|delete|alter|create|drop|truncate|grant|revoke|call|do)\b/i);
    expect(executableSql).toContain('SELECT');
    expect(executableSql).toContain('pg_policies');
    expect(executableSql).toContain('information_schema.table_privileges');
  });

  it('covers every Phase 8B launch-critical table in the SQL script', () => {
    for (const table of [
      'organizations',
      'organization_members',
      'projects',
      'outputs',
      'campaigns',
      'content_library_items',
      'organization_subscriptions',
      'subscription_usage_counters',
      'agency_clients',
      'agency_client_profiles',
      'client_integrations',
      'source_imports',
      'production_tasks',
      'agency_leads',
      'agency_funnel_events',
    ]) {
      expect(sql).toContain(`'${table}'`);
    }
  });

  it('checks the specific launch isolation risks called out by Phase 8B', () => {
    for (const expected of [
      'private_public_grants',
      'project_output_org_scope',
      'agency_internal_org_scope',
      'agency_reference_integrity',
      'billing_org_scope',
      'expected_trigger_present',
      'subscription_counter_function_privileges',
      'projects_missing_org_review',
      'outputs_project_org_mismatch',
      'agency_leads_missing_org_review',
      'agency_leads_converted_client_org_mismatch',
      'source_imports_client_org_mismatch',
      'production_tasks_client_org_mismatch',
    ]) {
      expect(sql).toContain(expected);
    }
  });

  it('documents manual staging accounts, expected cases, limitations, and blockers', () => {
    for (const expected of [
      'Manual Staging Test Accounts Needed',
      'Expected Pass And Fail Cases',
      'Known Limitations',
      'Launch Blockers',
      'saas_owner_a',
      'agency_admin_a',
      'agency_admin_b',
      'demo_user',
      'public_anonymous',
      'SaaS Org Isolation',
      'Public Lead And Analytics Privacy',
      'Service Role Boundary',
      'Slack And Granola Scope',
      'Billing Scope',
    ]) {
      expect(report).toContain(expected);
    }
  });
});
