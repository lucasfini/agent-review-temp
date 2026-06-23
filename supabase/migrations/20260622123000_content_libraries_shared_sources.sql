-- Shared source tracking for content libraries.
-- Mirrors the private/shared pattern used by creator profiles, brand voices, and plans.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'content_libraries'
      AND column_name = 'shared_from_library_id'
  ) THEN
    ALTER TABLE public.content_libraries
      ADD COLUMN shared_from_library_id UUID REFERENCES public.content_libraries(id) ON DELETE SET NULL;
  END IF;
END
$$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_content_libraries_org_shared_source_unique
  ON public.content_libraries(organization_id, shared_from_library_id)
  WHERE shared_from_library_id IS NOT NULL AND client_id IS NULL;
