import { readFileSync } from 'fs';
import path from 'path';

const migrationPath = path.join(
  process.cwd(),
  'supabase/migrations/20260606120000_phase_4a_internal_agency_schema.sql'
);
const sql = readFileSync(migrationPath, 'utf8');
const qaMigrationPath = path.join(
  process.cwd(),
  'supabase/migrations/20260607120000_phase_4h_agency_integrity_triggers.sql'
);
const qaSql = readFileSync(qaMigrationPath, 'utf8');
const slackTokenMigrationPath = path.join(
  process.cwd(),
  'supabase/migrations/20260608120000_phase_5b_slack_encrypted_tokens.sql'
);
const slackTokenSql = readFileSync(slackTokenMigrationPath, 'utf8');
const deliveryMigrationPath = path.join(
  process.cwd(),
  'supabase/migrations/20260608130000_phase_5e_agency_delivery_packages.sql'
);
const deliverySql = readFileSync(deliveryMigrationPath, 'utf8');
const leadMigrationPath = path.join(
  process.cwd(),
  'supabase/migrations/20260608140000_phase_6d_agency_leads.sql'
);
const leadSql = readFileSync(leadMigrationPath, 'utf8');
const leadConversionMigrationPath = path.join(
  process.cwd(),
  'supabase/migrations/20260608150000_phase_6f_agency_lead_conversion.sql'
);
const leadConversionSql = readFileSync(leadConversionMigrationPath, 'utf8');
const funnelEventsMigrationPath = path.join(
  process.cwd(),
  'supabase/migrations/20260608160000_phase_7d_agency_funnel_events.sql'
);
const funnelEventsSql = readFileSync(funnelEventsMigrationPath, 'utf8');
const leadQualificationMigrationPath = path.join(
  process.cwd(),
  'supabase/migrations/20260608170000_phase_7e_agency_lead_qualification.sql'
);
const leadQualificationSql = readFileSync(leadQualificationMigrationPath, 'utf8');

describe('phase 4A agency schema migration', () => {
  it('creates the required agency foundation tables', () => {
    for (const table of [
      'agency_clients',
      'agency_client_profiles',
      'client_integrations',
      'source_imports',
      'production_tasks',
    ]) {
      expect(sql).toContain(`CREATE TABLE IF NOT EXISTS public.${table}`);
    }
  });

  it('enables RLS on all agency tables', () => {
    for (const table of [
      'agency_clients',
      'agency_client_profiles',
      'client_integrations',
      'source_imports',
      'production_tasks',
    ]) {
      expect(sql).toContain(`ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY;`);
    }
  });

  it('keeps agency reads limited to active internal agency organization members', () => {
    expect(sql).toContain("o.type = ''internal_agency''");
    expect(sql).toContain("om.status = ''active''");
    expect(sql).toContain('Internal agency members can view agency clients');
    expect(sql).not.toContain('Active organization members can view agency clients');
  });

  it('keeps service-role management explicit for every agency table', () => {
    for (const table of [
      'agency_clients',
      'agency_client_profiles',
      'client_integrations',
      'source_imports',
      'production_tasks',
    ]) {
      expect(sql).toContain(`Service role can manage ${table}`);
    }
  });

  it('links agency records to existing campaign and content foundations', () => {
    expect(sql).toContain('campaign_id UUID REFERENCES public.campaigns(id) ON DELETE SET NULL');
    expect(sql).toContain('content_item_id UUID REFERENCES public.content_library_items(id) ON DELETE SET NULL');
    expect(sql).toContain('FOREIGN KEY (client_id) REFERENCES public.agency_clients(id)');
  });

  it('adds Phase 4H triggers for cross-reference integrity below API routes', () => {
    expect(qaSql).toContain('enforce_agency_client_internal_org');
    expect(qaSql).toContain('source_imports_enforce_agency_references');
    expect(qaSql).toContain('production_tasks_enforce_agency_references');
    expect(qaSql).toContain("o.type = 'internal_agency'");
    expect(qaSql).toContain('ac.organization_id = NEW.organization_id');
    expect(qaSql).toContain('c.organization_id = NEW.organization_id');
    expect(qaSql).toContain('cli.organization_id = NEW.organization_id');
  });

  it('adds Phase 5B encrypted token columns to client integrations', () => {
    expect(slackTokenSql).toContain('ADD COLUMN IF NOT EXISTS access_token_enc TEXT');
    expect(slackTokenSql).toContain('ADD COLUMN IF NOT EXISTS refresh_token_enc TEXT');
    expect(slackTokenSql).toContain("token_scopes TEXT[] NOT NULL DEFAULT '{}'::TEXT[]");
    expect(slackTokenSql).toContain('token_expires_at TIMESTAMPTZ');
    expect(slackTokenSql).not.toContain('metadata_json');
  });

  it('adds Phase 5E delivery packages with internal agency RLS and item integrity', () => {
    expect(deliverySql).toContain('CREATE TABLE IF NOT EXISTS public.agency_delivery_packages');
    expect(deliverySql).toContain('CREATE TABLE IF NOT EXISTS public.agency_delivery_package_items');
    expect(deliverySql).toContain('agency_delivery_packages_status_check');
    expect(deliverySql).toContain("status IN ('draft', 'ready', 'delivered', 'archived')");
    expect(deliverySql).toContain('agency_delivery_package_items_enforce_references');
    expect(deliverySql).toContain("o.type = 'internal_agency'");
    expect(deliverySql).toContain("o.type = ''internal_agency''");
    expect(deliverySql).toContain('Internal agency members can view delivery packages');
    expect(deliverySql).toContain('Internal agency admins can manage delivery packages');
    expect(deliverySql).toContain('Service role can manage agency_delivery_packages');
  });

  it('adds Phase 6D public agency leads as service-role-only private records', () => {
    expect(leadSql).toContain('CREATE TABLE IF NOT EXISTS public.agency_leads');
    expect(leadSql).toContain('email TEXT NOT NULL');
    expect(leadSql).toContain("status IN ('new', 'reviewed', 'qualified', 'converted', 'archived', 'spam')");
    expect(leadSql).toContain('ALTER TABLE public.agency_leads ENABLE ROW LEVEL SECURITY;');
    expect(leadSql).toContain('Service role can manage agency_leads');
    expect(leadSql).toContain('REVOKE ALL ON public.agency_leads FROM anon;');
    expect(leadSql).toContain('REVOKE ALL ON public.agency_leads FROM authenticated;');
  });

  it('adds Phase 6F explicit lead conversion links without auto-creating clients', () => {
    expect(leadConversionSql).toContain('ADD COLUMN IF NOT EXISTS converted_client_id UUID REFERENCES public.agency_clients(id) ON DELETE SET NULL');
    expect(leadConversionSql).toContain('ADD COLUMN IF NOT EXISTS converted_at TIMESTAMPTZ');
    expect(leadConversionSql).toContain('ADD COLUMN IF NOT EXISTS converted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL');
    expect(leadConversionSql).toContain('idx_agency_leads_converted_client_id');
    expect(leadConversionSql).not.toContain('CREATE TRIGGER');
  });

  it('adds Phase 7D first-party funnel events as service-role-only private records', () => {
    expect(funnelEventsSql).toContain('CREATE TABLE IF NOT EXISTS public.agency_funnel_events');
    expect(funnelEventsSql).toContain('lead_id UUID REFERENCES public.agency_leads(id) ON DELETE SET NULL');
    expect(funnelEventsSql).toContain('metadata_json JSONB NOT NULL DEFAULT');
    expect(funnelEventsSql).toContain('agency_funnel_events_event_name_check');
    expect(funnelEventsSql).toContain("'agency_page_view'");
    expect(funnelEventsSql).toContain("'agency_intake_submitted'");
    expect(funnelEventsSql).toContain('ALTER TABLE public.agency_funnel_events ENABLE ROW LEVEL SECURITY;');
    expect(funnelEventsSql).toContain('Service role can manage agency_funnel_events');
    expect(funnelEventsSql).toContain('REVOKE ALL ON public.agency_funnel_events FROM anon;');
    expect(funnelEventsSql).toContain('REVOKE ALL ON public.agency_funnel_events FROM authenticated;');
  });

  it('adds Phase 7E lead qualification and routing fields without changing lead privacy', () => {
    expect(leadQualificationSql).toContain('ADD COLUMN IF NOT EXISTS qualification_score INTEGER');
    expect(leadQualificationSql).toContain('ADD COLUMN IF NOT EXISTS qualification_tier TEXT');
    expect(leadQualificationSql).toContain('ADD COLUMN IF NOT EXISTS assigned_to UUID REFERENCES auth.users(id) ON DELETE SET NULL');
    expect(leadQualificationSql).toContain('ADD COLUMN IF NOT EXISTS review_notes TEXT');
    expect(leadQualificationSql).toContain('ADD COLUMN IF NOT EXISTS last_contacted_at TIMESTAMPTZ');
    expect(leadQualificationSql).toContain('ADD COLUMN IF NOT EXISTS next_follow_up_at TIMESTAMPTZ');
    expect(leadQualificationSql).toContain('agency_leads_qualification_score_check');
    expect(leadQualificationSql).toContain("qualification_tier IS NULL OR qualification_tier IN ('high', 'medium', 'low', 'unqualified')");
    expect(leadQualificationSql).not.toContain('CREATE POLICY');
  });
});
