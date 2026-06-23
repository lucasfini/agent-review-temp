-- Organization invitations for workspace team seats.
--
-- Safety goals:
-- - Store only hashed invite tokens.
-- - Keep invitations scoped to organizations.
-- - Enforce one active pending invite per organization/email.
-- - Let authenticated organization members view invites while trusted APIs manage mutations.

CREATE TABLE IF NOT EXISTS public.organization_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'member',
  token_hash TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  invited_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  accepted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  accepted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF to_regclass('public.organization_invitations') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM pg_constraint
       WHERE conname = 'organization_invitations_email_not_blank'
         AND conrelid = 'public.organization_invitations'::regclass
     ) THEN
    ALTER TABLE public.organization_invitations
      ADD CONSTRAINT organization_invitations_email_not_blank
      CHECK (length(btrim(email)) > 0);
  END IF;
END
$$;

DO $$
BEGIN
  IF to_regclass('public.organization_invitations') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM pg_constraint
       WHERE conname = 'organization_invitations_role_check'
         AND conrelid = 'public.organization_invitations'::regclass
     ) THEN
    ALTER TABLE public.organization_invitations
      ADD CONSTRAINT organization_invitations_role_check
      CHECK (role IN ('admin', 'member'));
  END IF;
END
$$;

DO $$
BEGIN
  IF to_regclass('public.organization_invitations') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM pg_constraint
       WHERE conname = 'organization_invitations_status_check'
         AND conrelid = 'public.organization_invitations'::regclass
     ) THEN
    ALTER TABLE public.organization_invitations
      ADD CONSTRAINT organization_invitations_status_check
      CHECK (status IN ('pending', 'accepted', 'canceled', 'expired'));
  END IF;
END
$$;

DO $$
BEGIN
  IF to_regclass('public.organization_invitations') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM pg_constraint
       WHERE conname = 'organization_invitations_token_hash_not_blank'
         AND conrelid = 'public.organization_invitations'::regclass
     ) THEN
    ALTER TABLE public.organization_invitations
      ADD CONSTRAINT organization_invitations_token_hash_not_blank
      CHECK (length(btrim(token_hash)) >= 32);
  END IF;
END
$$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_organization_invitations_pending_email_unique
  ON public.organization_invitations(organization_id, lower(email))
  WHERE status = 'pending';

CREATE UNIQUE INDEX IF NOT EXISTS idx_organization_invitations_token_hash_unique
  ON public.organization_invitations(token_hash);

CREATE INDEX IF NOT EXISTS idx_organization_invitations_organization_status
  ON public.organization_invitations(organization_id, status, expires_at);

CREATE INDEX IF NOT EXISTS idx_organization_invitations_invited_by
  ON public.organization_invitations(invited_by);

CREATE OR REPLACE FUNCTION public.set_organization_invitations_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.email = lower(btrim(NEW.email));
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  IF to_regclass('public.organization_invitations') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM pg_trigger
       WHERE tgname = 'organization_invitations_set_updated_at'
         AND tgrelid = 'public.organization_invitations'::regclass
     ) THEN
    CREATE TRIGGER organization_invitations_set_updated_at
      BEFORE INSERT OR UPDATE ON public.organization_invitations
      FOR EACH ROW
      EXECUTE FUNCTION public.set_organization_invitations_updated_at();
  END IF;
END
$$;

ALTER TABLE public.organization_invitations ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'organization_invitations'
      AND policyname = 'Active organization members can view invitations'
  ) THEN
    EXECUTE 'CREATE POLICY "Active organization members can view invitations" ON public.organization_invitations FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.organization_members om WHERE om.organization_id = organization_invitations.organization_id AND om.user_id = auth.uid() AND om.status = ''active''))';
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'organization_invitations'
      AND policyname = 'Service role can manage organization_invitations'
  ) THEN
    EXECUTE 'CREATE POLICY "Service role can manage organization_invitations" ON public.organization_invitations FOR ALL TO service_role USING (true) WITH CHECK (true)';
  END IF;
END
$$;

GRANT SELECT ON public.organization_invitations TO authenticated;
GRANT ALL ON public.organization_invitations TO service_role;
