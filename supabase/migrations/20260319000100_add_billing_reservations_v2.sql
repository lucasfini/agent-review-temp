CREATE TABLE IF NOT EXISTS public.billing_reservations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL,
  workflow_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('pending', 'active', 'settling', 'settled', 'released', 'expired', 'failed')),
  reserved_amount DECIMAL(10,4) NOT NULL CHECK (reserved_amount >= 0),
  settled_amount DECIMAL(10,4) NOT NULL DEFAULT 0 CHECK (settled_amount >= 0),
  released_amount DECIMAL(10,4) NOT NULL DEFAULT 0 CHECK (released_amount >= 0),
  currency TEXT NOT NULL DEFAULT 'USD',
  metadata JSONB DEFAULT '{}'::jsonb,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  CONSTRAINT billing_reservations_totals_check CHECK (
    settled_amount + released_amount <= reserved_amount + 0.0001
  )
);

CREATE INDEX IF NOT EXISTS idx_billing_reservations_user_date ON public.billing_reservations(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_billing_reservations_project ON public.billing_reservations(project_id) WHERE project_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_billing_reservations_status ON public.billing_reservations(status);

ALTER TABLE public.billing_reservations ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.usage_events
ADD COLUMN IF NOT EXISTS reservation_id UUID REFERENCES public.billing_reservations(id) ON DELETE SET NULL;

ALTER TABLE public.usage_events
ADD COLUMN IF NOT EXISTS workflow_step TEXT;

CREATE INDEX IF NOT EXISTS idx_usage_events_reservation ON public.usage_events(reservation_id) WHERE reservation_id IS NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'billing_reservations'
      AND policyname = 'Users can view own reservations'
  ) THEN
    EXECUTE 'CREATE POLICY "Users can view own reservations" ON public.billing_reservations FOR SELECT USING (auth.uid() = user_id)';
  END IF;
END
$$;

DO $$
DECLARE
  constraint_name TEXT;
BEGIN
  SELECT conname INTO constraint_name
  FROM pg_constraint
  WHERE conrelid = 'public.credit_transactions'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) ILIKE '%transaction_type%';

  IF constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.credit_transactions DROP CONSTRAINT %I', constraint_name);
  END IF;

  ALTER TABLE public.credit_transactions
  ADD CONSTRAINT credit_transactions_transaction_type_check
  CHECK (transaction_type IN ('purchase', 'bonus', 'refund', 'debit', 'admin_adjustment', 'reserve', 'release', 'settle'));
END
$$;

ALTER TABLE public.credit_transactions
ADD COLUMN IF NOT EXISTS reservation_id UUID REFERENCES public.billing_reservations(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_credit_transactions_reservation ON public.credit_transactions(reservation_id) WHERE reservation_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.reserve_user_credits(
  p_user_id UUID,
  p_amount DECIMAL(10,4),
  p_current_version INTEGER
)
RETURNS TABLE(
  success BOOLEAN,
  new_balance DECIMAL(10,4),
  new_version INTEGER,
  error_message TEXT
) AS $$
DECLARE
  v_current_balance DECIMAL(10,4);
  v_current_version INTEGER;
  v_new_balance DECIMAL(10,4);
  v_new_version INTEGER;
BEGIN
  SELECT balance, version INTO v_current_balance, v_current_version
  FROM public.account_credits
  WHERE user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 0::DECIMAL(10,4), 0, 'User credit account not found';
    RETURN;
  END IF;

  IF v_current_version != p_current_version THEN
    RETURN QUERY SELECT false, v_current_balance, v_current_version, 'Version mismatch - concurrent update detected';
    RETURN;
  END IF;

  IF v_current_balance < p_amount THEN
    RETURN QUERY SELECT false, v_current_balance, v_current_version,
      format('Insufficient credits: have $%s, need $%s', v_current_balance, p_amount);
    RETURN;
  END IF;

  v_new_balance := v_current_balance - p_amount;
  v_new_version := v_current_version + 1;

  UPDATE public.account_credits
  SET balance = v_new_balance, version = v_new_version, updated_at = NOW()
  WHERE user_id = p_user_id;

  RETURN QUERY SELECT true, v_new_balance, v_new_version, NULL::TEXT;
END;
$$ LANGUAGE plpgsql
SET search_path = '';

CREATE OR REPLACE FUNCTION public.release_reserved_credits(
  p_user_id UUID,
  p_amount DECIMAL(10,4),
  p_current_version INTEGER
)
RETURNS TABLE(
  success BOOLEAN,
  new_balance DECIMAL(10,4),
  new_version INTEGER,
  error_message TEXT
) AS $$
DECLARE
  v_current_balance DECIMAL(10,4);
  v_current_version INTEGER;
  v_new_balance DECIMAL(10,4);
  v_new_version INTEGER;
BEGIN
  SELECT balance, version INTO v_current_balance, v_current_version
  FROM public.account_credits
  WHERE user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 0::DECIMAL(10,4), 0, 'User credit account not found';
    RETURN;
  END IF;

  IF v_current_version != p_current_version THEN
    RETURN QUERY SELECT false, v_current_balance, v_current_version, 'Version mismatch - concurrent update detected';
    RETURN;
  END IF;

  v_new_balance := v_current_balance + p_amount;
  v_new_version := v_current_version + 1;

  UPDATE public.account_credits
  SET balance = v_new_balance, version = v_new_version, updated_at = NOW()
  WHERE user_id = p_user_id;

  RETURN QUERY SELECT true, v_new_balance, v_new_version, NULL::TEXT;
END;
$$ LANGUAGE plpgsql
SET search_path = '';

CREATE OR REPLACE FUNCTION public.settle_reserved_credits(
  p_user_id UUID,
  p_amount DECIMAL(10,4),
  p_current_version INTEGER
)
RETURNS TABLE(
  success BOOLEAN,
  new_balance DECIMAL(10,4),
  new_version INTEGER,
  error_message TEXT
) AS $$
DECLARE
  v_current_balance DECIMAL(10,4);
  v_current_version INTEGER;
  v_new_version INTEGER;
BEGIN
  SELECT balance, version INTO v_current_balance, v_current_version
  FROM public.account_credits
  WHERE user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 0::DECIMAL(10,4), 0, 'User credit account not found';
    RETURN;
  END IF;

  IF v_current_version != p_current_version THEN
    RETURN QUERY SELECT false, v_current_balance, v_current_version, 'Version mismatch - concurrent update detected';
    RETURN;
  END IF;

  v_new_version := v_current_version + 1;

  UPDATE public.account_credits
  SET version = v_new_version,
      lifetime_credits_spent = lifetime_credits_spent + p_amount,
      updated_at = NOW()
  WHERE user_id = p_user_id;

  RETURN QUERY SELECT true, v_current_balance, v_new_version, NULL::TEXT;
END;
$$ LANGUAGE plpgsql
SET search_path = '';

GRANT SELECT ON public.billing_reservations TO authenticated;
GRANT ALL ON public.billing_reservations TO service_role;
