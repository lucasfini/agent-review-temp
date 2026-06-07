import { readFileSync } from 'fs';
import path from 'path';

const migrationPath = path.join(
  process.cwd(),
  'supabase/migrations/20260606120000_phase_4a_internal_agency_schema.sql'
);
const sql = readFileSync(migrationPath, 'utf8');

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
});
