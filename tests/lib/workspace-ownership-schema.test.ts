import { readFileSync } from 'fs';
import path from 'path';

const migrationPath = path.join(
  process.cwd(),
  'supabase/migrations/20260622120000_workspace_single_active_owner.sql'
);
const sql = readFileSync(migrationPath, 'utf8');

describe('workspace owner constraints migration', () => {
  it('enforces one active owner per organization', () => {
    expect(sql).toContain('idx_organization_members_active_owner_unique');
    expect(sql).toContain("ON public.organization_members(organization_id)");
    expect(sql).toContain("WHERE role = 'owner' AND status = 'active'");
  });
});
