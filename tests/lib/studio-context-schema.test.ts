import { readFileSync } from 'fs';
import path from 'path';

const migrationPath = path.join(
  process.cwd(),
  'supabase/migrations/20260621233000_creator_profiles_content_libraries.sql'
);
const sql = readFileSync(migrationPath, 'utf8');
const privateSharedMigrationPath = path.join(
  process.cwd(),
  'supabase/migrations/20260622110000_studio_private_shared_assets.sql'
);
const privateSharedSql = readFileSync(privateSharedMigrationPath, 'utf8');

describe('Studio context schema migration', () => {
  it('creates creator profiles and content library collections', () => {
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS public.creator_profiles');
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS public.content_libraries');
    expect(sql).toContain('organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE');
    expect(sql).toContain('is_default BOOLEAN NOT NULL DEFAULT false');
  });

  it('adds nullable generation and saved item context columns', () => {
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS creator_profile_id UUID');
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS library_id UUID');
    expect(sql).toContain('content_library_items_creator_profile_id_fkey');
    expect(sql).toContain('project_generation_jobs_creator_profile_id_fkey');
    expect(sql).toContain('content_library_items_library_id_fkey');
    expect(sql).toContain('project_generation_jobs_library_id_fkey');
  });

  it('backfills creator profiles from existing organization metadata', () => {
    expect(sql).toContain('INSERT INTO public.creator_profiles');
    expect(sql).toContain("o.onboarding_metadata_json #>> '{profile,description}'");
    expect(sql).toContain("o.onboarding_metadata_json #>> '{profile,contentGoal}'");
    expect(sql).toContain('NOT EXISTS');
  });

  it('enables member read and admin write RLS for new organization-scoped tables', () => {
    for (const table of ['creator_profiles', 'content_libraries']) {
      expect(sql).toContain(`ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY;`);
      expect(sql).toContain(`Service role can manage ${table}`);
    }
    expect(sql).toContain('Active organization members can view creator profiles');
    expect(sql).toContain('Organization admins can insert creator profiles');
    expect(sql).toContain('Active organization members can view content libraries');
    expect(sql).toContain('Organization admins can insert content libraries');
  });

  it('adds private workspace preferences and shared Studio asset pointers', () => {
    expect(privateSharedSql).toContain('CREATE TABLE IF NOT EXISTS public.user_workspace_preferences');
    expect(privateSharedSql).toContain('active_organization_id UUID REFERENCES public.organizations(id)');
    expect(privateSharedSql).toContain('ADD COLUMN shared_from_profile_id UUID REFERENCES public.creator_profiles(id) ON DELETE SET NULL');
    expect(privateSharedSql).toContain('ADD COLUMN shared_from_voice_id UUID REFERENCES public.brand_voices(id) ON DELETE SET NULL');
    expect(privateSharedSql).toContain('ADD COLUMN shared_from_campaign_id UUID REFERENCES public.campaigns(id) ON DELETE SET NULL');
    expect(privateSharedSql).toContain('idx_creator_profiles_org_shared_source_unique');
    expect(privateSharedSql).toContain('idx_brand_voices_org_shared_source_unique');
    expect(privateSharedSql).toContain('idx_campaigns_org_shared_source_unique');
  });

  it('allows Studio asset owners and workspace admins to manage shared asset copies', () => {
    expect(privateSharedSql).toContain('Studio asset owners and org admins can insert creator profiles');
    expect(privateSharedSql).toContain('creator_profiles.created_by = auth.uid()');
    expect(privateSharedSql).toContain('Studio asset owners and org admins can insert brand voices');
    expect(privateSharedSql).toContain('brand_voices.created_by = auth.uid()');
    expect(privateSharedSql).toContain('Studio asset owners and org admins can insert campaigns');
    expect(privateSharedSql).toContain('campaigns.created_by = auth.uid()');
    expect(privateSharedSql).toContain('campaigns.owner_user_id = auth.uid()');
  });
});
