-- Phase 2A: Subscription Schema + Entitlement Foundation
-- Canonical source: supabase/migrations/
--
-- Safety goals:
-- - Add organization subscription foundations without changing current Stripe flows.
-- - Preserve credit/pay-as-you-go behavior.
-- - Keep subscription plan price IDs nullable until Phase 2B Stripe setup.
-- - Do not make existing organization_id columns NOT NULL.

CREATE TABLE IF NOT EXISTS public.plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  description TEXT,
  stripe_price_id TEXT UNIQUE,
  monthly_price_cents INTEGER,
  currency TEXT NOT NULL DEFAULT 'usd',
  seat_limit INTEGER,
  monthly_generation_limit INTEGER,
  monthly_transcription_minute_limit INTEGER,
  monthly_import_limit INTEGER,
  monthly_storage_mb_limit INTEGER,
  integration_limit INTEGER,
  features_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT true,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.organization_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  plan_id UUID REFERENCES public.plans(id) ON DELETE SET NULL,
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT UNIQUE,
  status TEXT NOT NULL DEFAULT 'inactive',
  current_period_start TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,
  cancel_at_period_end BOOLEAN NOT NULL DEFAULT false,
  trial_start TIMESTAMPTZ,
  trial_end TIMESTAMPTZ,
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF to_regclass('public.organization_subscriptions') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM pg_constraint
       WHERE conname = 'organization_subscriptions_status_check'
         AND conrelid = 'public.organization_subscriptions'::regclass
     ) THEN
    ALTER TABLE public.organization_subscriptions
      ADD CONSTRAINT organization_subscriptions_status_check
      CHECK (status IN (
        'inactive',
        'trialing',
        'active',
        'past_due',
        'canceled',
        'unpaid',
        'incomplete',
        'incomplete_expired'
      ));
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS idx_plans_slug
  ON public.plans(slug);

CREATE INDEX IF NOT EXISTS idx_plans_is_active
  ON public.plans(is_active);

CREATE INDEX IF NOT EXISTS idx_organization_subscriptions_organization_id
  ON public.organization_subscriptions(organization_id);

CREATE INDEX IF NOT EXISTS idx_organization_subscriptions_plan_id
  ON public.organization_subscriptions(plan_id);

CREATE INDEX IF NOT EXISTS idx_organization_subscriptions_stripe_customer_id
  ON public.organization_subscriptions(stripe_customer_id);

CREATE INDEX IF NOT EXISTS idx_organization_subscriptions_stripe_subscription_id
  ON public.organization_subscriptions(stripe_subscription_id);

CREATE INDEX IF NOT EXISTS idx_organization_subscriptions_status
  ON public.organization_subscriptions(status);

CREATE OR REPLACE FUNCTION public.set_plans_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION public.set_organization_subscriptions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  IF to_regclass('public.plans') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM pg_trigger
       WHERE tgname = 'plans_set_updated_at'
         AND tgrelid = 'public.plans'::regclass
     ) THEN
    CREATE TRIGGER plans_set_updated_at
      BEFORE UPDATE ON public.plans
      FOR EACH ROW
      EXECUTE FUNCTION public.set_plans_updated_at();
  END IF;
END
$$;

DO $$
BEGIN
  IF to_regclass('public.organization_subscriptions') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM pg_trigger
       WHERE tgname = 'organization_subscriptions_set_updated_at'
         AND tgrelid = 'public.organization_subscriptions'::regclass
     ) THEN
    CREATE TRIGGER organization_subscriptions_set_updated_at
      BEFORE UPDATE ON public.organization_subscriptions
      FOR EACH ROW
      EXECUTE FUNCTION public.set_organization_subscriptions_updated_at();
  END IF;
END
$$;

INSERT INTO public.plans (
  name,
  slug,
  description,
  stripe_price_id,
  monthly_price_cents,
  currency,
  seat_limit,
  monthly_generation_limit,
  monthly_transcription_minute_limit,
  monthly_import_limit,
  monthly_storage_mb_limit,
  integration_limit,
  features_json,
  is_active,
  display_order
)
VALUES
  (
    'Starter',
    'starter',
    'For founders and small teams starting with organization-based content workflows.',
    NULL,
    29900,
    'usd',
    3,
    4,
    600,
    4,
    5000,
    2,
    '{"content_channels":["linkedin","x"],"support":"standard","credit_payg_enabled":true}'::jsonb,
    true,
    10
  ),
  (
    'Growth',
    'growth',
    'For teams running a weekly content engine across calls, demos, podcasts, and updates.',
    NULL,
    79900,
    'usd',
    10,
    12,
    2400,
    12,
    25000,
    5,
    '{"content_channels":["linkedin","x","newsletter"],"priority_processing":true,"support":"priority","credit_payg_enabled":true}'::jsonb,
    true,
    20
  ),
  (
    'Scale',
    'scale',
    'For growing B2B teams with higher volume, approvals, and recurring publishing workflows.',
    NULL,
    NULL,
    'usd',
    25,
    40,
    9000,
    40,
    100000,
    10,
    '{"content_channels":["linkedin","x","newsletter","blog"],"custom_reporting":true,"support":"priority","credit_payg_enabled":true}'::jsonb,
    true,
    30
  ),
  (
    'Enterprise',
    'enterprise',
    'For teams that need custom limits, onboarding, support, and security review.',
    NULL,
    NULL,
    'usd',
    NULL,
    NULL,
    NULL,
    NULL,
    NULL,
    NULL,
    '{"custom_limits":true,"custom_security_review":true,"dedicated_support":true,"credit_payg_enabled":true}'::jsonb,
    true,
    40
  )
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  stripe_price_id = COALESCE(public.plans.stripe_price_id, EXCLUDED.stripe_price_id),
  monthly_price_cents = EXCLUDED.monthly_price_cents,
  currency = EXCLUDED.currency,
  seat_limit = EXCLUDED.seat_limit,
  monthly_generation_limit = EXCLUDED.monthly_generation_limit,
  monthly_transcription_minute_limit = EXCLUDED.monthly_transcription_minute_limit,
  monthly_import_limit = EXCLUDED.monthly_import_limit,
  monthly_storage_mb_limit = EXCLUDED.monthly_storage_mb_limit,
  integration_limit = EXCLUDED.integration_limit,
  features_json = public.plans.features_json || EXCLUDED.features_json,
  is_active = EXCLUDED.is_active,
  display_order = EXCLUDED.display_order,
  updated_at = now();

ALTER TABLE public.plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_subscriptions ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'plans'
      AND policyname = 'Authenticated users can view active plans'
  ) THEN
    EXECUTE 'CREATE POLICY "Authenticated users can view active plans" ON public.plans FOR SELECT TO authenticated USING (is_active = true)';
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'plans'
      AND policyname = 'Service role can manage plans'
  ) THEN
    EXECUTE 'CREATE POLICY "Service role can manage plans" ON public.plans FOR ALL TO service_role USING (true) WITH CHECK (true)';
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'organization_subscriptions'
      AND policyname = 'Organization members can view subscriptions'
  ) THEN
    EXECUTE 'CREATE POLICY "Organization members can view subscriptions" ON public.organization_subscriptions FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.organization_members om WHERE om.organization_id = organization_subscriptions.organization_id AND om.user_id = auth.uid() AND om.status = ''active''))';
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'organization_subscriptions'
      AND policyname = 'Service role can manage organization_subscriptions'
  ) THEN
    EXECUTE 'CREATE POLICY "Service role can manage organization_subscriptions" ON public.organization_subscriptions FOR ALL TO service_role USING (true) WITH CHECK (true)';
  END IF;
END
$$;

GRANT SELECT ON public.plans TO authenticated;
GRANT SELECT ON public.organization_subscriptions TO authenticated;
GRANT ALL ON public.plans TO service_role;
GRANT ALL ON public.organization_subscriptions TO service_role;
