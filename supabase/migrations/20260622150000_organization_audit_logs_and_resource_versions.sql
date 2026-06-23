CREATE TABLE IF NOT EXISTS public.organization_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  actor_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

CREATE INDEX IF NOT EXISTS organization_audit_logs_org_created_idx
  ON public.organization_audit_logs (organization_id, created_at DESC);

CREATE INDEX IF NOT EXISTS organization_audit_logs_action_idx
  ON public.organization_audit_logs (action);

ALTER TABLE public.organization_audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_only_organization_audit_logs" ON public.organization_audit_logs;

CREATE POLICY "service_role_only_organization_audit_logs"
ON public.organization_audit_logs
FOR ALL
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');

CREATE TABLE IF NOT EXISTS public.resource_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  resource_type TEXT NOT NULL,
  resource_id TEXT NOT NULL,
  version_number INTEGER NOT NULL,
  changed_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  change_summary TEXT NOT NULL,
  snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  previous_snapshot JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  CONSTRAINT resource_versions_resource_version_unique UNIQUE (resource_type, resource_id, version_number)
);

CREATE INDEX IF NOT EXISTS resource_versions_org_created_idx
  ON public.resource_versions (organization_id, created_at DESC);

CREATE INDEX IF NOT EXISTS resource_versions_resource_created_idx
  ON public.resource_versions (resource_type, resource_id, created_at DESC);

ALTER TABLE public.resource_versions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_only_resource_versions" ON public.resource_versions;

CREATE POLICY "service_role_only_resource_versions"
ON public.resource_versions
FOR ALL
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');
