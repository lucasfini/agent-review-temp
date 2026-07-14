-- Paid Teams extra seats
-- Adds Stripe price configuration for Teams extra-seat add-ons and synced
-- subscription item state used by workspace seat enforcement.

ALTER TABLE public.plans
  ADD COLUMN IF NOT EXISTS stripe_extra_seat_annual_price_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_plans_stripe_extra_seat_annual_price_id
  ON public.plans(stripe_extra_seat_annual_price_id)
  WHERE stripe_extra_seat_annual_price_id IS NOT NULL;

ALTER TABLE public.organization_subscriptions
  ADD COLUMN IF NOT EXISTS extra_seat_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS stripe_extra_seat_subscription_item_id TEXT,
  ADD COLUMN IF NOT EXISTS stripe_extra_seat_price_id TEXT;

DO $$
BEGIN
  IF to_regclass('public.organization_subscriptions') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM pg_constraint
       WHERE conname = 'organization_subscriptions_extra_seat_count_check'
         AND conrelid = 'public.organization_subscriptions'::regclass
     ) THEN
    ALTER TABLE public.organization_subscriptions
      ADD CONSTRAINT organization_subscriptions_extra_seat_count_check
      CHECK (extra_seat_count >= 0);
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS idx_organization_subscriptions_extra_seat_item
  ON public.organization_subscriptions(stripe_extra_seat_subscription_item_id)
  WHERE stripe_extra_seat_subscription_item_id IS NOT NULL;

COMMENT ON COLUMN public.plans.stripe_extra_seat_annual_price_id IS
  'Stripe annual recurring price ID for Teams extra seats.';
COMMENT ON COLUMN public.organization_subscriptions.extra_seat_count IS
  'Synced quantity of paid extra seats from the Stripe extra-seat subscription item.';
COMMENT ON COLUMN public.organization_subscriptions.stripe_extra_seat_subscription_item_id IS
  'Stripe subscription item ID for the paid extra-seat add-on.';
COMMENT ON COLUMN public.organization_subscriptions.stripe_extra_seat_price_id IS
  'Stripe price ID used by the paid extra-seat subscription item.';
