-- Personal/private Studio assets and shared workspace Studio assets.
-- Private assets continue to live in each user's personal organization.
-- Shared copies live in the active workspace and can reference the private source.

CREATE TABLE IF NOT EXISTS public.user_workspace_preferences (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  active_organization_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::TEXT, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::TEXT, now())
);

CREATE INDEX IF NOT EXISTS idx_user_workspace_preferences_active_org
  ON public.user_workspace_preferences(active_organization_id);

CREATE OR REPLACE FUNCTION public.set_user_workspace_preferences_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = timezone('utc'::TEXT, now());
  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'user_workspace_preferences_set_updated_at'
      AND tgrelid = 'public.user_workspace_preferences'::regclass
  ) THEN
    CREATE TRIGGER user_workspace_preferences_set_updated_at
      BEFORE UPDATE ON public.user_workspace_preferences
      FOR EACH ROW
      EXECUTE FUNCTION public.set_user_workspace_preferences_updated_at();
  END IF;
END
$$;

ALTER TABLE public.user_workspace_preferences ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'user_workspace_preferences'
      AND policyname = 'Users can view own workspace preference'
  ) THEN
    EXECUTE 'CREATE POLICY "Users can view own workspace preference" ON public.user_workspace_preferences FOR SELECT TO authenticated USING (user_id = auth.uid())';
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'user_workspace_preferences'
      AND policyname = 'Users can insert own workspace preference'
  ) THEN
    EXECUTE 'CREATE POLICY "Users can insert own workspace preference" ON public.user_workspace_preferences FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid() AND (active_organization_id IS NULL OR EXISTS (SELECT 1 FROM public.organization_members om WHERE om.organization_id = active_organization_id AND om.user_id = auth.uid() AND om.status = ''active'')))';
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'user_workspace_preferences'
      AND policyname = 'Users can update own workspace preference'
  ) THEN
    EXECUTE 'CREATE POLICY "Users can update own workspace preference" ON public.user_workspace_preferences FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid() AND (active_organization_id IS NULL OR EXISTS (SELECT 1 FROM public.organization_members om WHERE om.organization_id = active_organization_id AND om.user_id = auth.uid() AND om.status = ''active'')))';
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'creator_profiles'
      AND column_name = 'shared_from_profile_id'
  ) THEN
    ALTER TABLE public.creator_profiles
      ADD COLUMN shared_from_profile_id UUID REFERENCES public.creator_profiles(id) ON DELETE SET NULL;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'brand_voices'
      AND column_name = 'shared_from_voice_id'
  ) THEN
    ALTER TABLE public.brand_voices
      ADD COLUMN shared_from_voice_id UUID REFERENCES public.brand_voices(id) ON DELETE SET NULL;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'campaigns'
      AND column_name = 'shared_from_campaign_id'
  ) THEN
    ALTER TABLE public.campaigns
      ADD COLUMN shared_from_campaign_id UUID REFERENCES public.campaigns(id) ON DELETE SET NULL;
  END IF;
END
$$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_creator_profiles_org_shared_source_unique
  ON public.creator_profiles(organization_id, shared_from_profile_id)
  WHERE shared_from_profile_id IS NOT NULL AND client_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_brand_voices_org_shared_source_unique
  ON public.brand_voices(organization_id, shared_from_voice_id)
  WHERE shared_from_voice_id IS NOT NULL AND client_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_campaigns_org_shared_source_unique
  ON public.campaigns(organization_id, shared_from_campaign_id)
  WHERE shared_from_campaign_id IS NOT NULL AND client_id IS NULL;

DROP POLICY IF EXISTS "Organization admins can insert creator profiles" ON public.creator_profiles;
DROP POLICY IF EXISTS "Organization admins can update creator profiles" ON public.creator_profiles;
DROP POLICY IF EXISTS "Organization admins can delete creator profiles" ON public.creator_profiles;
DROP POLICY IF EXISTS "Organization admins can insert brand voices" ON public.brand_voices;
DROP POLICY IF EXISTS "Organization admins can update brand voices" ON public.brand_voices;
DROP POLICY IF EXISTS "Organization admins can delete brand voices" ON public.brand_voices;
DROP POLICY IF EXISTS "Organization admins can insert campaigns" ON public.campaigns;
DROP POLICY IF EXISTS "Organization admins can update campaigns" ON public.campaigns;
DROP POLICY IF EXISTS "Organization admins can delete campaigns" ON public.campaigns;

CREATE POLICY "Studio asset owners and org admins can insert creator profiles"
  ON public.creator_profiles
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.organization_members om
      JOIN public.organizations o ON o.id = om.organization_id
      WHERE om.organization_id = creator_profiles.organization_id
        AND om.user_id = auth.uid()
        AND om.status = 'active'
        AND (
          creator_profiles.created_by = auth.uid()
          OR om.role IN ('owner', 'admin')
          OR (om.role = 'agency_admin' AND o.type = 'internal_agency')
        )
    )
  );

CREATE POLICY "Studio asset owners and org admins can update creator profiles"
  ON public.creator_profiles
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.organization_members om
      JOIN public.organizations o ON o.id = om.organization_id
      WHERE om.organization_id = creator_profiles.organization_id
        AND om.user_id = auth.uid()
        AND om.status = 'active'
        AND (
          creator_profiles.created_by = auth.uid()
          OR om.role IN ('owner', 'admin')
          OR (om.role = 'agency_admin' AND o.type = 'internal_agency')
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.organization_members om
      JOIN public.organizations o ON o.id = om.organization_id
      WHERE om.organization_id = creator_profiles.organization_id
        AND om.user_id = auth.uid()
        AND om.status = 'active'
        AND (
          creator_profiles.created_by = auth.uid()
          OR om.role IN ('owner', 'admin')
          OR (om.role = 'agency_admin' AND o.type = 'internal_agency')
        )
    )
  );

CREATE POLICY "Studio asset owners and org admins can delete creator profiles"
  ON public.creator_profiles
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.organization_members om
      JOIN public.organizations o ON o.id = om.organization_id
      WHERE om.organization_id = creator_profiles.organization_id
        AND om.user_id = auth.uid()
        AND om.status = 'active'
        AND (
          creator_profiles.created_by = auth.uid()
          OR om.role IN ('owner', 'admin')
          OR (om.role = 'agency_admin' AND o.type = 'internal_agency')
        )
    )
  );

CREATE POLICY "Studio asset owners and org admins can insert brand voices"
  ON public.brand_voices
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.organization_members om
      JOIN public.organizations o ON o.id = om.organization_id
      WHERE om.organization_id = brand_voices.organization_id
        AND om.user_id = auth.uid()
        AND om.status = 'active'
        AND (
          brand_voices.created_by = auth.uid()
          OR om.role IN ('owner', 'admin')
          OR (om.role = 'agency_admin' AND o.type = 'internal_agency')
        )
    )
  );

CREATE POLICY "Studio asset owners and org admins can update brand voices"
  ON public.brand_voices
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.organization_members om
      JOIN public.organizations o ON o.id = om.organization_id
      WHERE om.organization_id = brand_voices.organization_id
        AND om.user_id = auth.uid()
        AND om.status = 'active'
        AND (
          brand_voices.created_by = auth.uid()
          OR om.role IN ('owner', 'admin')
          OR (om.role = 'agency_admin' AND o.type = 'internal_agency')
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.organization_members om
      JOIN public.organizations o ON o.id = om.organization_id
      WHERE om.organization_id = brand_voices.organization_id
        AND om.user_id = auth.uid()
        AND om.status = 'active'
        AND (
          brand_voices.created_by = auth.uid()
          OR om.role IN ('owner', 'admin')
          OR (om.role = 'agency_admin' AND o.type = 'internal_agency')
        )
    )
  );

CREATE POLICY "Studio asset owners and org admins can delete brand voices"
  ON public.brand_voices
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.organization_members om
      JOIN public.organizations o ON o.id = om.organization_id
      WHERE om.organization_id = brand_voices.organization_id
        AND om.user_id = auth.uid()
        AND om.status = 'active'
        AND (
          brand_voices.created_by = auth.uid()
          OR om.role IN ('owner', 'admin')
          OR (om.role = 'agency_admin' AND o.type = 'internal_agency')
        )
    )
  );

CREATE POLICY "Studio asset owners and org admins can insert campaigns"
  ON public.campaigns
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.organization_members om
      JOIN public.organizations o ON o.id = om.organization_id
      WHERE om.organization_id = campaigns.organization_id
        AND om.user_id = auth.uid()
        AND om.status = 'active'
        AND (
          campaigns.created_by = auth.uid()
          OR campaigns.owner_user_id = auth.uid()
          OR om.role IN ('owner', 'admin')
          OR (om.role = 'agency_admin' AND o.type = 'internal_agency')
        )
    )
  );

CREATE POLICY "Studio asset owners and org admins can update campaigns"
  ON public.campaigns
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.organization_members om
      JOIN public.organizations o ON o.id = om.organization_id
      WHERE om.organization_id = campaigns.organization_id
        AND om.user_id = auth.uid()
        AND om.status = 'active'
        AND (
          campaigns.created_by = auth.uid()
          OR campaigns.owner_user_id = auth.uid()
          OR om.role IN ('owner', 'admin')
          OR (om.role = 'agency_admin' AND o.type = 'internal_agency')
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.organization_members om
      JOIN public.organizations o ON o.id = om.organization_id
      WHERE om.organization_id = campaigns.organization_id
        AND om.user_id = auth.uid()
        AND om.status = 'active'
        AND (
          campaigns.created_by = auth.uid()
          OR campaigns.owner_user_id = auth.uid()
          OR om.role IN ('owner', 'admin')
          OR (om.role = 'agency_admin' AND o.type = 'internal_agency')
        )
    )
  );

CREATE POLICY "Studio asset owners and org admins can delete campaigns"
  ON public.campaigns
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.organization_members om
      JOIN public.organizations o ON o.id = om.organization_id
      WHERE om.organization_id = campaigns.organization_id
        AND om.user_id = auth.uid()
        AND om.status = 'active'
        AND (
          campaigns.created_by = auth.uid()
          OR campaigns.owner_user_id = auth.uid()
          OR om.role IN ('owner', 'admin')
          OR (om.role = 'agency_admin' AND o.type = 'internal_agency')
        )
    )
  );

GRANT SELECT, INSERT, UPDATE ON public.user_workspace_preferences TO authenticated;
GRANT ALL ON public.user_workspace_preferences TO service_role;
