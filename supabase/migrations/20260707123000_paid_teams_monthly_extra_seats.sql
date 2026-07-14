-- Paid Teams monthly extra seats
-- Adds Stripe monthly recurring price configuration for Teams extra-seat add-ons.

ALTER TABLE public.plans
  ADD COLUMN IF NOT EXISTS stripe_extra_seat_monthly_price_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_plans_stripe_extra_seat_monthly_price_id
  ON public.plans(stripe_extra_seat_monthly_price_id)
  WHERE stripe_extra_seat_monthly_price_id IS NOT NULL;

COMMENT ON COLUMN public.plans.stripe_extra_seat_monthly_price_id IS
  'Stripe monthly recurring price ID for Teams extra seats.';
