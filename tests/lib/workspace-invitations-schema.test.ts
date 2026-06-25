import { readFileSync } from 'fs';
import path from 'path';

const migrationPath = path.join(
  process.cwd(),
  'supabase/migrations/20260622133000_workspace_roles_editor_reader_and_library_snapshots.sql'
);
const sql = readFileSync(migrationPath, 'utf8');

describe('workspace invitations schema migration', () => {
  it('migrates invitation roles to editor and allows admin/editor/reader for new invites', () => {
    expect(sql).toContain("UPDATE public.organization_invitations");
    expect(sql).toContain("SET role = 'editor'");
    expect(sql).toContain("ALTER COLUMN role SET DEFAULT 'editor'");
    expect(sql).toContain("CHECK (role IN ('admin', 'editor', 'reader'))");
  });

  it('migrates legacy workspace members to editor and expands the allowed workspace roles', () => {
    expect(sql).toContain("UPDATE public.organization_members");
    expect(sql).toContain("CHECK (role IN ('owner', 'admin', 'editor', 'reader', 'agency_admin', 'agency_member'))");
  });
});
