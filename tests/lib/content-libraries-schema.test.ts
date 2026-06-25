import { readFileSync } from 'fs';
import path from 'path';

const migrationPath = path.join(
  process.cwd(),
  'supabase/migrations/20260622123000_content_libraries_shared_sources.sql'
);
const sql = readFileSync(migrationPath, 'utf8');

describe('content library sharing schema migration', () => {
  it('adds shared source tracking to content libraries', () => {
    expect(sql).toContain('shared_from_library_id UUID REFERENCES public.content_libraries(id) ON DELETE SET NULL');
    expect(sql).toContain('idx_content_libraries_org_shared_source_unique');
    expect(sql).toContain('ON public.content_libraries(organization_id, shared_from_library_id)');
  });
});
