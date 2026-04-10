CREATE TABLE IF NOT EXISTS public.admin_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id uuid NOT NULL,
  admin_email text NOT NULL,
  action text NOT NULL,
  target_type text NOT NULL,
  target_id text,
  target_label text,
  reason text,
  status text NOT NULL DEFAULT 'success' CHECK (status IN ('success', 'error')),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);

CREATE INDEX IF NOT EXISTS admin_audit_logs_created_at_idx
  ON public.admin_audit_logs (created_at DESC);

CREATE INDEX IF NOT EXISTS admin_audit_logs_action_idx
  ON public.admin_audit_logs (action);

ALTER TABLE public.admin_audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_only_admin_audit_logs" ON public.admin_audit_logs;

CREATE POLICY "service_role_only_admin_audit_logs"
ON public.admin_audit_logs
FOR ALL
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');
