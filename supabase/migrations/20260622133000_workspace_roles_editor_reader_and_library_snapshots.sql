-- Workspace roles, Studio locking fields, and library generation snapshots.
--
-- Safety goals:
-- - Migrate legacy member roles and invitations to editor without deleting data.
-- - Expand workspace roles to owner/admin/editor/reader while keeping agency roles intact.
-- - Normalize campaign/content library statuses to the newer app unions.
-- - Add ownership, locking, and snapshot fields as nullable or defaulted columns.

UPDATE public.organization_members
SET role = 'editor'
WHERE role = 'member';

UPDATE public.organization_invitations
SET role = 'editor'
WHERE role = 'member';

ALTER TABLE public.organization_members
  DROP CONSTRAINT IF EXISTS organization_members_role_check;

ALTER TABLE public.organization_members
  ADD CONSTRAINT organization_members_role_check
  CHECK (role IN ('owner', 'admin', 'editor', 'reader', 'agency_admin', 'agency_member'));

ALTER TABLE public.organization_invitations
  ALTER COLUMN role SET DEFAULT 'editor';

ALTER TABLE public.organization_invitations
  DROP CONSTRAINT IF EXISTS organization_invitations_role_check;

ALTER TABLE public.organization_invitations
  ADD CONSTRAINT organization_invitations_role_check
  CHECK (role IN ('admin', 'editor', 'reader'));

UPDATE public.campaigns
SET status = 'draft'
WHERE status = 'planned';

ALTER TABLE public.campaigns
  ALTER COLUMN status SET DEFAULT 'draft';

ALTER TABLE public.campaigns
  DROP CONSTRAINT IF EXISTS campaigns_status_check;

ALTER TABLE public.campaigns
  ADD CONSTRAINT campaigns_status_check
  CHECK (status IN ('draft', 'active', 'paused', 'completed', 'archived'));

UPDATE public.content_library_items
SET status = 'in_review'
WHERE status = 'review';

ALTER TABLE public.content_library_items
  DROP CONSTRAINT IF EXISTS content_library_items_status_check;

ALTER TABLE public.content_library_items
  ADD CONSTRAINT content_library_items_status_check
  CHECK (status IN ('draft', 'in_review', 'approved', 'scheduled', 'published', 'archived', 'needs_revision'));

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'creator_profiles'
      AND column_name = 'owner_user_id'
  ) THEN
    ALTER TABLE public.creator_profiles
      ADD COLUMN owner_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'creator_profiles'
      AND column_name = 'locked'
  ) THEN
    ALTER TABLE public.creator_profiles
      ADD COLUMN locked BOOLEAN NOT NULL DEFAULT false;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'brand_voices'
      AND column_name = 'owner_user_id'
  ) THEN
    ALTER TABLE public.brand_voices
      ADD COLUMN owner_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'brand_voices'
      AND column_name = 'locked'
  ) THEN
    ALTER TABLE public.brand_voices
      ADD COLUMN locked BOOLEAN NOT NULL DEFAULT false;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'campaigns'
      AND column_name = 'approval_required'
  ) THEN
    ALTER TABLE public.campaigns
      ADD COLUMN approval_required BOOLEAN NOT NULL DEFAULT false;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'campaigns'
      AND column_name = 'locked'
  ) THEN
    ALTER TABLE public.campaigns
      ADD COLUMN locked BOOLEAN NOT NULL DEFAULT false;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'content_libraries'
      AND column_name = 'owner_user_id'
  ) THEN
    ALTER TABLE public.content_libraries
      ADD COLUMN owner_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'content_libraries'
      AND column_name = 'locked'
  ) THEN
    ALTER TABLE public.content_libraries
      ADD COLUMN locked BOOLEAN NOT NULL DEFAULT false;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'content_library_items'
      AND column_name = 'owner_user_id'
  ) THEN
    ALTER TABLE public.content_library_items
      ADD COLUMN owner_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'content_library_items'
      AND column_name = 'locked'
  ) THEN
    ALTER TABLE public.content_library_items
      ADD COLUMN locked BOOLEAN NOT NULL DEFAULT false;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'content_library_items'
      AND column_name = 'scheduled_for'
  ) THEN
    ALTER TABLE public.content_library_items
      ADD COLUMN scheduled_for TIMESTAMPTZ;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'content_library_items'
      AND column_name = 'approved_by_user_id'
  ) THEN
    ALTER TABLE public.content_library_items
      ADD COLUMN approved_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'content_library_items'
      AND column_name = 'approved_at'
  ) THEN
    ALTER TABLE public.content_library_items
      ADD COLUMN approved_at TIMESTAMPTZ;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'content_library_items'
      AND column_name = 'generation_context_snapshot'
  ) THEN
    ALTER TABLE public.content_library_items
      ADD COLUMN generation_context_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb;
  END IF;
END
$$;

UPDATE public.creator_profiles
SET owner_user_id = created_by
WHERE owner_user_id IS NULL;

UPDATE public.brand_voices
SET owner_user_id = created_by
WHERE owner_user_id IS NULL;

UPDATE public.content_libraries
SET owner_user_id = created_by
WHERE owner_user_id IS NULL;

UPDATE public.content_library_items
SET owner_user_id = created_by
WHERE owner_user_id IS NULL;

UPDATE public.content_library_items
SET generation_context_snapshot = COALESCE(metadata_json -> 'generation_context', '{}'::jsonb)
WHERE generation_context_snapshot = '{}'::jsonb
  AND jsonb_typeof(COALESCE(metadata_json -> 'generation_context', '{}'::jsonb)) = 'object';
