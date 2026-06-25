-- Phase 2E: Canonical Subscription Usage Counters
-- Canonical source: supabase/migrations/
--
-- Safety goals:
-- - Add organization-scoped, period-based subscription counters.
-- - Keep existing usage_events and credit/pay-as-you-go behavior intact.
-- - Do not enable hard subscription enforcement.

CREATE TABLE IF NOT EXISTS public.subscription_usage_counters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  subscription_id UUID REFERENCES public.organization_subscriptions(id) ON DELETE SET NULL,
  period_start TIMESTAMPTZ NOT NULL,
  period_end TIMESTAMPTZ NOT NULL,
  counter_key TEXT NOT NULL,
  quantity NUMERIC NOT NULL DEFAULT 0,
  unit TEXT NOT NULL,
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF to_regclass('public.subscription_usage_counters') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM pg_constraint
       WHERE conname = 'subscription_usage_counters_quantity_non_negative'
         AND conrelid = 'public.subscription_usage_counters'::regclass
     ) THEN
    ALTER TABLE public.subscription_usage_counters
      ADD CONSTRAINT subscription_usage_counters_quantity_non_negative
      CHECK (quantity >= 0);
  END IF;
END
$$;

DO $$
BEGIN
  IF to_regclass('public.subscription_usage_counters') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM pg_constraint
       WHERE conname = 'subscription_usage_counters_period_valid'
         AND conrelid = 'public.subscription_usage_counters'::regclass
     ) THEN
    ALTER TABLE public.subscription_usage_counters
      ADD CONSTRAINT subscription_usage_counters_period_valid
      CHECK (period_end > period_start);
  END IF;
END
$$;

DO $$
BEGIN
  IF to_regclass('public.subscription_usage_counters') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM pg_constraint
       WHERE conname = 'subscription_usage_counters_counter_key_check'
         AND conrelid = 'public.subscription_usage_counters'::regclass
     ) THEN
    ALTER TABLE public.subscription_usage_counters
      ADD CONSTRAINT subscription_usage_counters_counter_key_check
      CHECK (counter_key IN (
        'content_generation',
        'transcription_minutes',
        'audio_upload',
        'integration_import',
        'storage_mb',
        'seat'
      ));
  END IF;
END
$$;

DO $$
BEGIN
  IF to_regclass('public.subscription_usage_counters') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM pg_constraint
       WHERE conname = 'subscription_usage_counters_unit_check'
         AND conrelid = 'public.subscription_usage_counters'::regclass
     ) THEN
    ALTER TABLE public.subscription_usage_counters
      ADD CONSTRAINT subscription_usage_counters_unit_check
      CHECK (unit IN ('count', 'minutes', 'mb'));
  END IF;
END
$$;

DO $$
BEGIN
  IF to_regclass('public.subscription_usage_counters') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM pg_constraint
       WHERE conname = 'subscription_usage_counters_org_period_counter_unique'
         AND conrelid = 'public.subscription_usage_counters'::regclass
     ) THEN
    ALTER TABLE public.subscription_usage_counters
      ADD CONSTRAINT subscription_usage_counters_org_period_counter_unique
      UNIQUE (organization_id, period_start, period_end, counter_key);
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS idx_subscription_usage_counters_organization_id
  ON public.subscription_usage_counters(organization_id);

CREATE INDEX IF NOT EXISTS idx_subscription_usage_counters_subscription_id
  ON public.subscription_usage_counters(subscription_id);

CREATE INDEX IF NOT EXISTS idx_subscription_usage_counters_counter_key
  ON public.subscription_usage_counters(counter_key);

CREATE INDEX IF NOT EXISTS idx_subscription_usage_counters_period
  ON public.subscription_usage_counters(period_start, period_end);

CREATE INDEX IF NOT EXISTS idx_subscription_usage_counters_org_key_period
  ON public.subscription_usage_counters(organization_id, counter_key, period_start);

CREATE OR REPLACE FUNCTION public.set_subscription_usage_counters_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION public.increment_subscription_usage_counter(
  p_organization_id UUID,
  p_subscription_id UUID,
  p_period_start TIMESTAMPTZ,
  p_period_end TIMESTAMPTZ,
  p_counter_key TEXT,
  p_quantity NUMERIC,
  p_unit TEXT,
  p_metadata_json JSONB DEFAULT '{}'::jsonb,
  p_idempotency_key TEXT DEFAULT NULL
)
RETURNS public.subscription_usage_counters
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.subscription_usage_counters;
  v_now_text TEXT := now()::TEXT;
  v_insert_metadata JSONB := COALESCE(p_metadata_json, '{}'::jsonb);
BEGIN
  IF p_quantity IS NULL OR p_quantity <= 0 THEN
    RAISE EXCEPTION 'Counter quantity must be greater than zero';
  END IF;

  v_insert_metadata := jsonb_set(
    v_insert_metadata,
    '{lastRecordedAt}',
    to_jsonb(v_now_text),
    true
  );

  IF p_idempotency_key IS NOT NULL THEN
    v_insert_metadata := jsonb_set(
      v_insert_metadata,
      '{idempotencyKeys}',
      to_jsonb(ARRAY[p_idempotency_key]::TEXT[]),
      true
    );
  END IF;

  INSERT INTO public.subscription_usage_counters (
    organization_id,
    subscription_id,
    period_start,
    period_end,
    counter_key,
    quantity,
    unit,
    metadata_json
  )
  VALUES (
    p_organization_id,
    p_subscription_id,
    p_period_start,
    p_period_end,
    p_counter_key,
    p_quantity,
    p_unit,
    v_insert_metadata
  )
  ON CONFLICT ON CONSTRAINT subscription_usage_counters_org_period_counter_unique
  DO UPDATE SET
    subscription_id = COALESCE(EXCLUDED.subscription_id, subscription_usage_counters.subscription_id),
    unit = EXCLUDED.unit,
    quantity = CASE
      WHEN p_idempotency_key IS NOT NULL
        AND COALESCE(subscription_usage_counters.metadata_json->'idempotencyKeys', '[]'::jsonb) ? p_idempotency_key
      THEN subscription_usage_counters.quantity
      ELSE subscription_usage_counters.quantity + EXCLUDED.quantity
    END,
    metadata_json = CASE
      WHEN p_idempotency_key IS NOT NULL
        AND COALESCE(subscription_usage_counters.metadata_json->'idempotencyKeys', '[]'::jsonb) ? p_idempotency_key
      THEN subscription_usage_counters.metadata_json
      ELSE jsonb_set(
        (subscription_usage_counters.metadata_json || EXCLUDED.metadata_json) - 'idempotencyKeys',
        '{idempotencyKeys}',
        COALESCE(
          (
            SELECT to_jsonb(array_agg(value))
            FROM (
              SELECT DISTINCT value
              FROM jsonb_array_elements_text(
                COALESCE(subscription_usage_counters.metadata_json->'idempotencyKeys', '[]'::jsonb)
                || COALESCE(EXCLUDED.metadata_json->'idempotencyKeys', '[]'::jsonb)
              ) AS keys(value)
              ORDER BY value
            ) distinct_keys
          ),
          '[]'::jsonb
        ),
        true
      )
    END,
    updated_at = now()
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

DO $$
BEGIN
  IF to_regclass('public.subscription_usage_counters') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM pg_trigger
       WHERE tgname = 'subscription_usage_counters_set_updated_at'
         AND tgrelid = 'public.subscription_usage_counters'::regclass
     ) THEN
    CREATE TRIGGER subscription_usage_counters_set_updated_at
      BEFORE UPDATE ON public.subscription_usage_counters
      FOR EACH ROW
      EXECUTE FUNCTION public.set_subscription_usage_counters_updated_at();
  END IF;
END
$$;

ALTER TABLE public.subscription_usage_counters ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'subscription_usage_counters'
      AND policyname = 'Organization members can view subscription usage counters'
  ) THEN
    EXECUTE 'CREATE POLICY "Organization members can view subscription usage counters" ON public.subscription_usage_counters FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.organization_members om WHERE om.organization_id = subscription_usage_counters.organization_id AND om.user_id = auth.uid() AND om.status = ''active''))';
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'subscription_usage_counters'
      AND policyname = 'Service role can manage subscription usage counters'
  ) THEN
    EXECUTE 'CREATE POLICY "Service role can manage subscription usage counters" ON public.subscription_usage_counters FOR ALL TO service_role USING (true) WITH CHECK (true)';
  END IF;
END
$$;

GRANT SELECT ON public.subscription_usage_counters TO authenticated;
GRANT ALL ON public.subscription_usage_counters TO service_role;
REVOKE ALL ON FUNCTION public.increment_subscription_usage_counter(
  UUID,
  UUID,
  TIMESTAMPTZ,
  TIMESTAMPTZ,
  TEXT,
  NUMERIC,
  TEXT,
  JSONB,
  TEXT
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.increment_subscription_usage_counter(
  UUID,
  UUID,
  TIMESTAMPTZ,
  TIMESTAMPTZ,
  TEXT,
  NUMERIC,
  TEXT,
  JSONB,
  TEXT
) TO service_role;
