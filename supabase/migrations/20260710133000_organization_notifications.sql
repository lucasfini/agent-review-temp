CREATE TABLE IF NOT EXISTS public.organization_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  actor_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT,
  href TEXT,
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  idempotency_key TEXT,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_organization_notifications_idempotency
  ON public.organization_notifications(organization_id, idempotency_key);

CREATE INDEX IF NOT EXISTS idx_organization_notifications_org_created
  ON public.organization_notifications(organization_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_organization_notifications_org_unread
  ON public.organization_notifications(organization_id, created_at DESC)
  WHERE read_at IS NULL;

ALTER TABLE public.organization_notifications ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'organization_notifications'
      AND policyname = 'Organization members can view notifications'
  ) THEN
    CREATE POLICY "Organization members can view notifications"
      ON public.organization_notifications
      FOR SELECT
      TO authenticated
      USING (
        EXISTS (
          SELECT 1
          FROM public.organization_members om
          WHERE om.organization_id = organization_notifications.organization_id
            AND om.user_id = auth.uid()
            AND om.status = 'active'
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'organization_notifications'
      AND policyname = 'Organization members can mark notifications read'
  ) THEN
    CREATE POLICY "Organization members can mark notifications read"
      ON public.organization_notifications
      FOR UPDATE
      TO authenticated
      USING (
        EXISTS (
          SELECT 1
          FROM public.organization_members om
          WHERE om.organization_id = organization_notifications.organization_id
            AND om.user_id = auth.uid()
            AND om.status = 'active'
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1
          FROM public.organization_members om
          WHERE om.organization_id = organization_notifications.organization_id
            AND om.user_id = auth.uid()
            AND om.status = 'active'
        )
      );
  END IF;
END $$;

GRANT SELECT, UPDATE ON public.organization_notifications TO authenticated;
GRANT ALL ON public.organization_notifications TO service_role;

COMMENT ON TABLE public.organization_notifications IS 'Organization-scoped persisted dashboard notifications for billing, team, imports, uploads, and processing lifecycle events.';
