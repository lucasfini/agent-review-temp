import { readFileSync } from 'fs';
import path from 'path';

const migrationPath = path.join(
  process.cwd(),
  'supabase/migrations/20260704120000_user_onboarding_status.sql'
);
const sql = readFileSync(migrationPath, 'utf8');

describe('guided onboarding schema migration', () => {
  it('adds nullable profile onboarding state for resumable setup', () => {
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS onboarding_status TEXT');
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS onboarding_completed_at TIMESTAMPTZ');
    expect(sql).toContain("ADD COLUMN IF NOT EXISTS onboarding_metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb");
  });

  it('allows every guided onboarding state and keeps metadata object-shaped', () => {
    for (const status of [
      'profile_pending',
      'workspace_pending',
      'profile_intro_pending',
      'voice_intro_pending',
      'plan_intro_pending',
      'upload_intro_pending',
      'complete',
    ]) {
      expect(sql).toContain(status);
    }
    expect(sql).toContain('profiles_onboarding_metadata_object');
    expect(sql).toContain('jsonb_typeof(onboarding_metadata_json)');
  });
});
