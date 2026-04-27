CREATE TABLE IF NOT EXISTS public.billing_price_overrides (
  key text PRIMARY KEY,
  value jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.billing_price_overrides ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_only_billing_price_overrides" ON public.billing_price_overrides;

CREATE POLICY "service_role_only_billing_price_overrides"
ON public.billing_price_overrides
FOR ALL
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');

GRANT ALL ON public.billing_price_overrides TO service_role;
