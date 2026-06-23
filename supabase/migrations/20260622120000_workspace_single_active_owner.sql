-- Ensure each workspace has at most one active owner.

CREATE UNIQUE INDEX IF NOT EXISTS idx_organization_members_active_owner_unique
  ON public.organization_members(organization_id)
  WHERE role = 'owner' AND status = 'active';
