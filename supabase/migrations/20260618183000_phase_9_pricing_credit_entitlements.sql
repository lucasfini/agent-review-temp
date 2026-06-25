-- Phase 9: Pricing and product-credit entitlement model
-- Canonical source: supabase/migrations/
--
-- Safety goals:
-- - Reuse existing plans, organization_subscriptions, and billing_reservations.
-- - Keep legacy user-scoped account_credits intact for backwards compatibility.
-- - Add org-scoped credit grant lots for expiry, rollover, and Teams pooled credits.
-- - Deactivate legacy public tiers instead of deleting historical rows.

ALTER TABLE public.plans
  ADD COLUMN IF NOT EXISTS monthly_credit_grant INTEGER,
  ADD COLUMN IF NOT EXISTS annual_price_cents INTEGER,
  ADD COLUMN IF NOT EXISTS stripe_monthly_price_id TEXT,
  ADD COLUMN IF NOT EXISTS stripe_annual_price_id TEXT,
  ADD COLUMN IF NOT EXISTS credit_rollover_months INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS top_up_enabled BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS top_up_credit_expiry_months INTEGER NOT NULL DEFAULT 12,
  ADD COLUMN IF NOT EXISTS max_upload_minutes INTEGER,
  ADD COLUMN IF NOT EXISTS extra_seat_price_cents INTEGER,
  ADD COLUMN IF NOT EXISTS is_popular BOOLEAN NOT NULL DEFAULT false;

CREATE UNIQUE INDEX IF NOT EXISTS idx_plans_stripe_monthly_price_id
  ON public.plans(stripe_monthly_price_id)
  WHERE stripe_monthly_price_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_plans_stripe_annual_price_id
  ON public.plans(stripe_annual_price_id)
  WHERE stripe_annual_price_id IS NOT NULL;

DO $$
BEGIN
  IF to_regclass('public.plans') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM pg_constraint
       WHERE conname = 'plans_credit_fields_non_negative_check'
         AND conrelid = 'public.plans'::regclass
     ) THEN
    ALTER TABLE public.plans
      ADD CONSTRAINT plans_credit_fields_non_negative_check
      CHECK (
        (monthly_credit_grant IS NULL OR monthly_credit_grant >= 0)
        AND (annual_price_cents IS NULL OR annual_price_cents >= 0)
        AND credit_rollover_months >= 0
        AND top_up_credit_expiry_months >= 0
        AND (max_upload_minutes IS NULL OR max_upload_minutes > 0)
        AND (extra_seat_price_cents IS NULL OR extra_seat_price_cents >= 0)
      );
  END IF;
END
$$;

ALTER TABLE public.billing_reservations
  ADD COLUMN IF NOT EXISTS credit_unit TEXT NOT NULL DEFAULT 'legacy_usd';

DO $$
BEGIN
  IF to_regclass('public.billing_reservations') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM pg_constraint
       WHERE conname = 'billing_reservations_credit_unit_check'
         AND conrelid = 'public.billing_reservations'::regclass
     ) THEN
    ALTER TABLE public.billing_reservations
      ADD CONSTRAINT billing_reservations_credit_unit_check
      CHECK (credit_unit IN ('legacy_usd', 'plan_credit'));
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS idx_billing_reservations_credit_unit
  ON public.billing_reservations(credit_unit);

CREATE TABLE IF NOT EXISTS public.billing_credit_grants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  subscription_id UUID REFERENCES public.organization_subscriptions(id) ON DELETE SET NULL,
  plan_id UUID REFERENCES public.plans(id) ON DELETE SET NULL,
  source_type TEXT NOT NULL,
  credits_granted NUMERIC(12,4) NOT NULL,
  credits_remaining NUMERIC(12,4) NOT NULL,
  period_start TIMESTAMPTZ,
  period_end TIMESTAMPTZ,
  expires_at TIMESTAMPTZ NOT NULL,
  idempotency_key TEXT NOT NULL UNIQUE,
  stripe_payment_id TEXT,
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT billing_credit_grants_source_type_check
    CHECK (source_type IN ('plan_grant', 'rollover', 'top_up', 'promo', 'adjustment')),
  CONSTRAINT billing_credit_grants_amounts_check
    CHECK (
      credits_granted >= 0
      AND credits_remaining >= 0
      AND credits_remaining <= credits_granted + 0.0001
    )
);

CREATE INDEX IF NOT EXISTS idx_billing_credit_grants_org_expires
  ON public.billing_credit_grants(organization_id, expires_at);

CREATE INDEX IF NOT EXISTS idx_billing_credit_grants_org_source
  ON public.billing_credit_grants(organization_id, source_type);

CREATE INDEX IF NOT EXISTS idx_billing_credit_grants_subscription
  ON public.billing_credit_grants(subscription_id)
  WHERE subscription_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.billing_reservation_credit_allocations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reservation_id UUID NOT NULL REFERENCES public.billing_reservations(id) ON DELETE CASCADE,
  grant_id UUID NOT NULL REFERENCES public.billing_credit_grants(id) ON DELETE RESTRICT,
  reserved_credits NUMERIC(12,4) NOT NULL,
  settled_credits NUMERIC(12,4) NOT NULL DEFAULT 0,
  released_credits NUMERIC(12,4) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT billing_reservation_credit_allocations_amounts_check
    CHECK (
      reserved_credits >= 0
      AND settled_credits >= 0
      AND released_credits >= 0
      AND settled_credits + released_credits <= reserved_credits + 0.0001
    ),
  CONSTRAINT billing_reservation_credit_allocations_unique
    UNIQUE (reservation_id, grant_id)
);

CREATE INDEX IF NOT EXISTS idx_billing_reservation_credit_allocations_reservation
  ON public.billing_reservation_credit_allocations(reservation_id);

CREATE INDEX IF NOT EXISTS idx_billing_reservation_credit_allocations_grant
  ON public.billing_reservation_credit_allocations(grant_id);

CREATE OR REPLACE FUNCTION public.set_billing_credit_grants_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION public.set_billing_reservation_credit_allocations_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  IF to_regclass('public.billing_credit_grants') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM pg_trigger
       WHERE tgname = 'billing_credit_grants_set_updated_at'
         AND tgrelid = 'public.billing_credit_grants'::regclass
     ) THEN
    CREATE TRIGGER billing_credit_grants_set_updated_at
      BEFORE UPDATE ON public.billing_credit_grants
      FOR EACH ROW
      EXECUTE FUNCTION public.set_billing_credit_grants_updated_at();
  END IF;
END
$$;

DO $$
BEGIN
  IF to_regclass('public.billing_reservation_credit_allocations') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM pg_trigger
       WHERE tgname = 'billing_reservation_credit_allocations_set_updated_at'
         AND tgrelid = 'public.billing_reservation_credit_allocations'::regclass
     ) THEN
    CREATE TRIGGER billing_reservation_credit_allocations_set_updated_at
      BEFORE UPDATE ON public.billing_reservation_credit_allocations
      FOR EACH ROW
      EXECUTE FUNCTION public.set_billing_reservation_credit_allocations_updated_at();
  END IF;
END
$$;

ALTER TABLE public.billing_credit_grants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_reservation_credit_allocations ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'billing_credit_grants'
      AND policyname = 'Organization members can view billing credit grants'
  ) THEN
    EXECUTE 'CREATE POLICY "Organization members can view billing credit grants" ON public.billing_credit_grants FOR SELECT TO authenticated USING (
      EXISTS (
        SELECT 1
        FROM public.organization_members om
        WHERE om.organization_id = billing_credit_grants.organization_id
          AND om.user_id = auth.uid()
          AND om.status = ''active''
      )
    )';
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'billing_reservation_credit_allocations'
      AND policyname = 'Organization members can view billing credit allocations'
  ) THEN
    EXECUTE 'CREATE POLICY "Organization members can view billing credit allocations" ON public.billing_reservation_credit_allocations FOR SELECT TO authenticated USING (
      EXISTS (
        SELECT 1
        FROM public.billing_reservations br
        JOIN public.organization_members om
          ON om.organization_id = br.organization_id
        WHERE br.id = billing_reservation_credit_allocations.reservation_id
          AND om.user_id = auth.uid()
          AND om.status = ''active''
      )
    )';
  END IF;
END
$$;

GRANT SELECT ON public.billing_credit_grants TO authenticated;
GRANT SELECT ON public.billing_reservation_credit_allocations TO authenticated;
GRANT ALL ON public.billing_credit_grants TO service_role;
GRANT ALL ON public.billing_reservation_credit_allocations TO service_role;

UPDATE public.plans
SET is_active = false,
    updated_at = now()
WHERE slug IN ('starter', 'growth', 'scale', 'enterprise');

INSERT INTO public.plans (
  name,
  slug,
  description,
  stripe_price_id,
  monthly_price_cents,
  annual_price_cents,
  stripe_monthly_price_id,
  stripe_annual_price_id,
  currency,
  seat_limit,
  monthly_generation_limit,
  monthly_transcription_minute_limit,
  monthly_import_limit,
  monthly_storage_mb_limit,
  integration_limit,
  monthly_credit_grant,
  credit_rollover_months,
  top_up_enabled,
  top_up_credit_expiry_months,
  max_upload_minutes,
  extra_seat_price_cents,
  is_popular,
  features_json,
  is_active,
  display_order
)
VALUES
  (
    'Free',
    'free',
    'Trying the full workflow with one complete 60-minute Repurpose Pack each month.',
    NULL,
    0,
    0,
    NULL,
    NULL,
    'usd',
    1,
    NULL,
    NULL,
    NULL,
    1000,
    0,
    300,
    0,
    false,
    12,
    60,
    NULL,
    false,
    '{
      "best_for":"Trying the full workflow",
      "credit_label":"300 credits/month, up to 1 full 60-minute Repurpose Pack",
      "approx_repurpose_pack_hours":1,
      "credits_pooled":false,
      "no_credit_card_required":true,
      "content_exports":"1 content export",
      "feature_items":["Transcript","Speaker labels","Summary","One full 60-minute Repurpose Pack trial","1 content export","60-minute max upload","No credit card required"]
    }'::jsonb,
    true,
    10
  ),
  (
    'Standard',
    'standard',
    'Solo founders, consultants, and small B2B content workflows.',
    NULL,
    4999,
    50990,
    'price_1Tkt6GCsRaVYgQwjkJLVwSDf',
    'price_1TktAoCsRaVYgQwjMNTPo6B4',
    'usd',
    1,
    NULL,
    NULL,
    NULL,
    10000,
    2,
    3000,
    1,
    true,
    12,
    60,
    NULL,
    false,
    '{
      "best_for":"Solo founders, consultants, and small B2B content workflows",
      "credit_label":"3,000 credits/month, about 10 Repurpose Pack hours",
      "approx_repurpose_pack_hours":10,
      "credits_pooled":false,
      "brand_voice_limit":2,
      "support":"email",
      "feature_items":["All Free features","Full Content Kit","Full Repurpose Pack","LinkedIn, X, newsletter, show notes, and blog outline outputs","2 brand voices","Basic publishing calendar","Email support"]
    }'::jsonb,
    true,
    20
  ),
  (
    'Pro',
    'pro',
    'Teams producing recurring LinkedIn, newsletter, blog, and podcast content.',
    NULL,
    14900,
    151980,
    'price_1Tkt6vCsRaVYgQwjgHq2bCEI',
    'price_1TktBNCsRaVYgQwjUjAczqHC',
    'usd',
    3,
    NULL,
    NULL,
    NULL,
    50000,
    5,
    10000,
    1,
    true,
    12,
    60,
    NULL,
    true,
    '{
      "best_for":"Teams producing recurring LinkedIn, newsletter, blog, and podcast content",
      "credit_label":"10,000 credits/month, about 33 Repurpose Pack hours",
      "approx_repurpose_pack_hours":33,
      "credits_pooled":false,
      "shared_brand_voice_library":true,
      "priority_processing":true,
      "campaign_calendar":true,
      "reusable_templates":true,
      "advanced_speaker_review":true,
      "content_intelligence":["Recurring themes","Audience pain points","Objections","Quote-worthy moments","Content angles detected across recordings"],
      "support":"priority",
      "feature_items":["All Standard features","3 seats","Shared brand voice library","Priority processing","Full output library","Campaign calendar","Reusable templates","Advanced speaker review","Content intelligence","Priority support"]
    }'::jsonb,
    true,
    30
  ),
  (
    'Teams',
    'teams',
    'B2B marketing teams running a shared content engine.',
    NULL,
    39900,
    406980,
    'price_1Tkt7TCsRaVYgQwjhHX3uDSn',
    'price_1TktBoCsRaVYgQwjlh3PHmIj',
    'usd',
    5,
    NULL,
    NULL,
    NULL,
    250000,
    10,
    35000,
    1,
    true,
    12,
    60,
    2900,
    false,
    '{
      "best_for":"B2B marketing teams running a shared content engine",
      "credit_label":"35,000 pooled credits/month, about 117 Repurpose Pack hours",
      "approx_repurpose_pack_hours":117,
      "credits_pooled":true,
      "extra_seat_label":"$29/user/month annually",
      "roles_permissions":true,
      "approval_workflow_enabled":true,
      "shared_workspace":true,
      "usage_analytics":true,
      "centralized_billing":true,
      "onboarding_call":true,
      "support":"priority",
      "sso_add_on":true,
      "custom_limits_via_sales":true,
      "feature_items":["All Pro features","5 included seats","Pooled credits","Roles and permissions","Approval workflow","Shared workspace","Usage analytics","Centralized billing","Onboarding call","Priority support","SSO available as an add-on","Custom limits handled through sales"]
    }'::jsonb,
    true,
    40
  )
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  stripe_price_id = COALESCE(public.plans.stripe_price_id, EXCLUDED.stripe_price_id),
  monthly_price_cents = EXCLUDED.monthly_price_cents,
  annual_price_cents = EXCLUDED.annual_price_cents,
  stripe_monthly_price_id = COALESCE(public.plans.stripe_monthly_price_id, EXCLUDED.stripe_monthly_price_id),
  stripe_annual_price_id = COALESCE(public.plans.stripe_annual_price_id, EXCLUDED.stripe_annual_price_id),
  currency = EXCLUDED.currency,
  seat_limit = EXCLUDED.seat_limit,
  monthly_generation_limit = EXCLUDED.monthly_generation_limit,
  monthly_transcription_minute_limit = EXCLUDED.monthly_transcription_minute_limit,
  monthly_import_limit = EXCLUDED.monthly_import_limit,
  monthly_storage_mb_limit = EXCLUDED.monthly_storage_mb_limit,
  integration_limit = EXCLUDED.integration_limit,
  monthly_credit_grant = EXCLUDED.monthly_credit_grant,
  credit_rollover_months = EXCLUDED.credit_rollover_months,
  top_up_enabled = EXCLUDED.top_up_enabled,
  top_up_credit_expiry_months = EXCLUDED.top_up_credit_expiry_months,
  max_upload_minutes = EXCLUDED.max_upload_minutes,
  extra_seat_price_cents = EXCLUDED.extra_seat_price_cents,
  is_popular = EXCLUDED.is_popular,
  features_json = public.plans.features_json || EXCLUDED.features_json,
  is_active = EXCLUDED.is_active,
  display_order = EXCLUDED.display_order,
  updated_at = now();

COMMENT ON COLUMN public.plans.monthly_credit_grant IS 'Monthly product-credit grant for the plan. Product credits are processing capacity, not cash value.';
COMMENT ON COLUMN public.plans.annual_price_cents IS 'Total annual subscription price in cents.';
COMMENT ON COLUMN public.plans.max_upload_minutes IS 'Maximum audio length per upload/import for this plan.';
COMMENT ON COLUMN public.billing_reservations.credit_unit IS 'legacy_usd for historical user balance reservations, plan_credit for subscription product-credit reservations.';
COMMENT ON TABLE public.billing_credit_grants IS 'Organization-scoped product-credit lots with expiry for plan grants, rollover, top-ups, promos, and adjustments.';
COMMENT ON TABLE public.billing_reservation_credit_allocations IS 'Reservation-to-grant allocations used to release failed jobs and settle completed product-credit usage.';
