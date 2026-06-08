-- Phase 8B: Supabase RLS launch readiness verification
--
-- READ ONLY. This file is safe to run against staging or production-like
-- Supabase databases. It reports catalog and data-quality findings only.
-- Expected launch result: zero FAIL rows. WARN rows require documented review.

-- 1. Required table existence and RLS enablement.
WITH expected_tables(table_name) AS (
  VALUES
    ('organizations'),
    ('organization_members'),
    ('projects'),
    ('outputs'),
    ('campaigns'),
    ('content_library_items'),
    ('organization_subscriptions'),
    ('subscription_usage_counters'),
    ('agency_clients'),
    ('agency_client_profiles'),
    ('client_integrations'),
    ('source_imports'),
    ('production_tasks'),
    ('agency_leads'),
    ('agency_funnel_events')
),
table_state AS (
  SELECT
    e.table_name,
    c.oid,
    c.relrowsecurity
  FROM expected_tables e
  LEFT JOIN pg_class c
    ON c.relname = e.table_name
   AND c.relnamespace = 'public'::regnamespace
   AND c.relkind = 'r'
)
SELECT
  'required_table_rls' AS check_name,
  table_name AS subject,
  CASE
    WHEN oid IS NULL THEN 'FAIL'
    WHEN relrowsecurity THEN 'PASS'
    ELSE 'FAIL'
  END AS status,
  CASE
    WHEN oid IS NULL THEN 'Required table is missing'
    WHEN relrowsecurity THEN 'RLS is enabled'
    ELSE 'RLS is disabled'
  END AS detail
FROM table_state
ORDER BY subject;

-- 2. Expected policy catalog coverage for Phase 8 launch-critical tables.
WITH expected_policies(table_name, policy_name) AS (
  VALUES
    ('organizations', 'Users can view member organizations'),
    ('organizations', 'Service role can manage organizations'),
    ('organization_members', 'Users can view own active memberships'),
    ('organization_members', 'Service role can manage organization_members'),
    ('campaigns', 'Active organization members can view campaigns'),
    ('campaigns', 'Organization admins can insert campaigns'),
    ('campaigns', 'Organization admins can update campaigns'),
    ('campaigns', 'Organization admins can delete campaigns'),
    ('campaigns', 'Service role can manage campaigns'),
    ('content_library_items', 'Active organization members can view content library items'),
    ('content_library_items', 'Organization admins can insert content library items'),
    ('content_library_items', 'Organization admins can update content library items'),
    ('content_library_items', 'Organization admins can delete content library items'),
    ('content_library_items', 'Service role can manage content_library_items'),
    ('organization_subscriptions', 'Organization members can view subscriptions'),
    ('organization_subscriptions', 'Service role can manage organization_subscriptions'),
    ('subscription_usage_counters', 'Organization members can view subscription usage counters'),
    ('subscription_usage_counters', 'Service role can manage subscription usage counters'),
    ('agency_clients', 'Internal agency members can view agency clients'),
    ('agency_clients', 'Internal agency admins can insert agency clients'),
    ('agency_clients', 'Internal agency admins can update agency clients'),
    ('agency_clients', 'Internal agency admins can delete agency clients'),
    ('agency_clients', 'Service role can manage agency_clients'),
    ('agency_client_profiles', 'Internal agency members can view client profiles'),
    ('agency_client_profiles', 'Internal agency admins can manage client profiles'),
    ('agency_client_profiles', 'Service role can manage agency_client_profiles'),
    ('client_integrations', 'Internal agency members can view client integrations'),
    ('client_integrations', 'Internal agency admins can manage client integrations'),
    ('client_integrations', 'Service role can manage client_integrations'),
    ('source_imports', 'Internal agency members can view source imports'),
    ('source_imports', 'Internal agency operators can insert source imports'),
    ('source_imports', 'Internal agency operators can update source imports'),
    ('source_imports', 'Service role can manage source_imports'),
    ('production_tasks', 'Internal agency members can view production tasks'),
    ('production_tasks', 'Internal agency operators can insert production tasks'),
    ('production_tasks', 'Internal agency operators can update production tasks'),
    ('production_tasks', 'Internal agency admins can delete production tasks'),
    ('production_tasks', 'Service role can manage production_tasks'),
    ('agency_leads', 'Service role can manage agency_leads'),
    ('agency_funnel_events', 'Service role can manage agency_funnel_events')
)
SELECT
  'expected_policy_present' AS check_name,
  table_name || ' / ' || policy_name AS subject,
  CASE WHEN p.policyname IS NULL THEN 'FAIL' ELSE 'PASS' END AS status,
  CASE WHEN p.policyname IS NULL THEN 'Expected policy is missing' ELSE 'Expected policy exists' END AS detail
FROM expected_policies e
LEFT JOIN pg_policies p
  ON p.schemaname = 'public'
 AND p.tablename = e.table_name
 AND p.policyname = e.policy_name
ORDER BY subject;

-- 3. Public privacy checks for private lead and funnel tables.
WITH private_tables(table_name) AS (
  VALUES
    ('agency_leads'),
    ('agency_funnel_events')
),
exposed_privileges AS (
  SELECT
    t.table_name,
    count(tp.privilege_type) AS privilege_count,
    string_agg(tp.grantee || ':' || tp.privilege_type, ', ' ORDER BY tp.grantee, tp.privilege_type) AS privileges
  FROM private_tables t
  LEFT JOIN information_schema.table_privileges tp
    ON tp.table_schema = 'public'
   AND tp.table_name = t.table_name
   AND tp.grantee IN ('PUBLIC', 'anon', 'authenticated')
  GROUP BY t.table_name
)
SELECT
  'private_public_grants' AS check_name,
  table_name AS subject,
  CASE WHEN privilege_count = 0 THEN 'PASS' ELSE 'FAIL' END AS status,
  CASE WHEN privilege_count = 0 THEN 'No direct PUBLIC/anon/authenticated grants' ELSE privileges END AS detail
FROM exposed_privileges
ORDER BY subject;

-- 4. Legacy project/output organization scope should be reviewed before launch.
WITH project_output_findings(subject, finding_count) AS (
  SELECT
    'projects_missing_org_review',
    count(*)
  FROM public.projects p
  WHERE p.organization_id IS NULL

  UNION ALL

  SELECT
    'outputs_missing_org_review',
    count(*)
  FROM public.outputs o
  WHERE o.organization_id IS NULL

  UNION ALL

  SELECT
    'outputs_project_org_mismatch',
    count(*)
  FROM public.outputs o
  JOIN public.projects p ON p.id = o.project_id
  WHERE o.organization_id IS NOT NULL
    AND p.organization_id IS NOT NULL
    AND o.organization_id <> p.organization_id
)
SELECT
  'project_output_org_scope' AS check_name,
  subject,
  CASE
    WHEN subject IN ('projects_missing_org_review', 'outputs_missing_org_review') AND finding_count > 0 THEN 'WARN'
    WHEN finding_count = 0 THEN 'PASS'
    ELSE 'FAIL'
  END AS status,
  finding_count::text || ' row(s)' AS detail
FROM project_output_findings
ORDER BY subject;

-- 5. Agency table ownership must stay inside internal agency organizations.
WITH agency_scope_findings(subject, finding_count) AS (
  SELECT
    'agency_clients_non_internal_org',
    count(*)
  FROM public.agency_clients ac
  LEFT JOIN public.organizations o ON o.id = ac.organization_id
  WHERE o.id IS NULL OR o.type <> 'internal_agency'

  UNION ALL

  SELECT
    'source_imports_non_internal_org',
    count(*)
  FROM public.source_imports si
  LEFT JOIN public.organizations o ON o.id = si.organization_id
  WHERE o.id IS NULL OR o.type <> 'internal_agency'

  UNION ALL

  SELECT
    'production_tasks_non_internal_org',
    count(*)
  FROM public.production_tasks pt
  LEFT JOIN public.organizations o ON o.id = pt.organization_id
  WHERE o.id IS NULL OR o.type <> 'internal_agency'

  UNION ALL

  SELECT
    'agency_leads_non_internal_org',
    count(*)
  FROM public.agency_leads al
  LEFT JOIN public.organizations o ON o.id = al.organization_id
  WHERE al.organization_id IS NOT NULL
    AND (o.id IS NULL OR o.type <> 'internal_agency')

  UNION ALL

  SELECT
    'agency_leads_missing_org_review',
    count(*)
  FROM public.agency_leads al
  WHERE al.organization_id IS NULL
)
SELECT
  'agency_internal_org_scope' AS check_name,
  subject,
  CASE
    WHEN subject = 'agency_leads_missing_org_review' AND finding_count > 0 THEN 'WARN'
    WHEN finding_count = 0 THEN 'PASS'
    ELSE 'FAIL'
  END AS status,
  finding_count::text || ' row(s)' AS detail
FROM agency_scope_findings
ORDER BY subject;

-- 6. Agency cross-reference integrity for clients, campaigns, content, and conversions.
WITH reference_findings(subject, finding_count) AS (
  SELECT
    'source_imports_client_org_mismatch',
    count(*)
  FROM public.source_imports si
  JOIN public.agency_clients ac ON ac.id = si.client_id
  WHERE ac.organization_id <> si.organization_id

  UNION ALL

  SELECT
    'source_imports_campaign_org_mismatch',
    count(*)
  FROM public.source_imports si
  JOIN public.campaigns c ON c.id = si.campaign_id
  WHERE c.organization_id <> si.organization_id

  UNION ALL

  SELECT
    'source_imports_campaign_client_mismatch',
    count(*)
  FROM public.source_imports si
  JOIN public.campaigns c ON c.id = si.campaign_id
  WHERE si.client_id IS NOT NULL
    AND c.client_id IS NOT NULL
    AND c.client_id <> si.client_id

  UNION ALL

  SELECT
    'production_tasks_client_org_mismatch',
    count(*)
  FROM public.production_tasks pt
  JOIN public.agency_clients ac ON ac.id = pt.client_id
  WHERE ac.organization_id <> pt.organization_id

  UNION ALL

  SELECT
    'production_tasks_campaign_org_mismatch',
    count(*)
  FROM public.production_tasks pt
  JOIN public.campaigns c ON c.id = pt.campaign_id
  WHERE c.organization_id <> pt.organization_id

  UNION ALL

  SELECT
    'production_tasks_content_item_org_mismatch',
    count(*)
  FROM public.production_tasks pt
  JOIN public.content_library_items cli ON cli.id = pt.content_item_id
  WHERE cli.organization_id <> pt.organization_id

  UNION ALL

  SELECT
    'agency_leads_converted_client_org_mismatch',
    count(*)
  FROM public.agency_leads al
  JOIN public.agency_clients ac ON ac.id = al.converted_client_id
  WHERE al.organization_id IS NOT NULL
    AND ac.organization_id <> al.organization_id
)
SELECT
  'agency_reference_integrity' AS check_name,
  subject,
  CASE WHEN finding_count = 0 THEN 'PASS' ELSE 'FAIL' END AS status,
  finding_count::text || ' row(s)' AS detail
FROM reference_findings
ORDER BY subject;

-- 7. Billing/subscription rows must remain organization-scoped.
WITH billing_findings(subject, finding_count) AS (
  SELECT
    'organization_subscriptions_missing_org',
    count(*)
  FROM public.organization_subscriptions os
  LEFT JOIN public.organizations o ON o.id = os.organization_id
  WHERE o.id IS NULL

  UNION ALL

  SELECT
    'subscription_usage_counters_missing_org',
    count(*)
  FROM public.subscription_usage_counters suc
  LEFT JOIN public.organizations o ON o.id = suc.organization_id
  WHERE o.id IS NULL

  UNION ALL

  SELECT
    'subscription_usage_counters_invalid_period',
    count(*)
  FROM public.subscription_usage_counters suc
  WHERE suc.period_end <= suc.period_start

  UNION ALL

  SELECT
    'subscription_usage_counters_negative_quantity',
    count(*)
  FROM public.subscription_usage_counters suc
  WHERE suc.quantity < 0

  UNION ALL

  SELECT
    'organizations_with_multiple_current_subscriptions_review',
    count(*)
  FROM (
    SELECT os.organization_id
    FROM public.organization_subscriptions os
    WHERE os.status IN ('trialing', 'active', 'past_due')
    GROUP BY os.organization_id
    HAVING count(*) > 1
  ) duplicate_current
)
SELECT
  'billing_org_scope' AS check_name,
  subject,
  CASE
    WHEN subject = 'organizations_with_multiple_current_subscriptions_review' AND finding_count > 0 THEN 'WARN'
    WHEN finding_count = 0 THEN 'PASS'
    ELSE 'FAIL'
  END AS status,
  finding_count::text || ' row(s)' AS detail
FROM billing_findings
ORDER BY subject;

-- 8. Critical integrity triggers must exist.
WITH expected_triggers(table_name, trigger_name) AS (
  VALUES
    ('agency_clients', 'agency_clients_enforce_internal_org'),
    ('source_imports', 'source_imports_enforce_agency_references'),
    ('production_tasks', 'production_tasks_enforce_agency_references'),
    ('agency_leads', 'agency_leads_enforce_internal_org')
)
SELECT
  'expected_trigger_present' AS check_name,
  table_name || ' / ' || trigger_name AS subject,
  CASE WHEN t.tgname IS NULL THEN 'FAIL' ELSE 'PASS' END AS status,
  CASE WHEN t.tgname IS NULL THEN 'Expected trigger is missing' ELSE 'Expected trigger exists' END AS detail
FROM expected_triggers e
LEFT JOIN pg_class c
  ON c.relname = e.table_name
 AND c.relnamespace = 'public'::regnamespace
LEFT JOIN pg_trigger t
  ON t.tgrelid = c.oid
 AND t.tgname = e.trigger_name
 AND NOT t.tgisinternal
ORDER BY subject;

-- 9. The subscription counter increment function should not be executable by public roles.
WITH function_state AS (
  SELECT (
    SELECT p.oid
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'increment_subscription_usage_counter'
    ORDER BY p.oid
    LIMIT 1
  ) AS oid
),
role_state AS (
  SELECT
    to_regrole('anon') AS anon_role,
    to_regrole('authenticated') AS authenticated_role
)
SELECT
  'subscription_counter_function_privileges' AS check_name,
  'increment_subscription_usage_counter' AS subject,
  CASE
    WHEN fs.oid IS NULL THEN 'FAIL'
    WHEN rs.anon_role IS NULL OR rs.authenticated_role IS NULL THEN 'SKIP'
    WHEN has_function_privilege('anon', fs.oid, 'EXECUTE') THEN 'FAIL'
    WHEN has_function_privilege('authenticated', fs.oid, 'EXECUTE') THEN 'FAIL'
    ELSE 'PASS'
  END AS status,
  CASE
    WHEN fs.oid IS NULL THEN 'Function is missing'
    WHEN rs.anon_role IS NULL OR rs.authenticated_role IS NULL THEN 'Supabase anon/authenticated roles are not available in this database'
    WHEN has_function_privilege('anon', fs.oid, 'EXECUTE') THEN 'anon can execute the counter function'
    WHEN has_function_privilege('authenticated', fs.oid, 'EXECUTE') THEN 'authenticated can execute the counter function'
    ELSE 'Only privileged roles can execute the counter function'
  END AS detail
FROM function_state fs
CROSS JOIN role_state rs;
