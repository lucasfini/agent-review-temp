-- Fix billing RPCs after linter hardening set an empty search_path.
-- With search_path = '', unqualified relation names inside these functions
-- no longer resolve, so debit/add credit operations fail at runtime.

CREATE OR REPLACE FUNCTION public.debit_user_credits(
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
  SET
    balance = v_new_balance,
    version = v_new_version,
    lifetime_credits_spent = lifetime_credits_spent + p_amount,
    updated_at = NOW()
  WHERE user_id = p_user_id;

  RETURN QUERY SELECT true, v_new_balance, v_new_version, NULL::TEXT;
END;
$$ LANGUAGE plpgsql
SET search_path = '';

CREATE OR REPLACE FUNCTION public.add_user_credits(
  p_user_id UUID,
  p_amount DECIMAL(10,4),
  p_transaction_type TEXT DEFAULT 'purchase'
)
RETURNS TABLE(
  success BOOLEAN,
  new_balance DECIMAL(10,4),
  new_version INTEGER
) AS $$
DECLARE
  v_new_balance DECIMAL(10,4);
  v_new_version INTEGER;
BEGIN
  INSERT INTO public.account_credits (user_id, balance, lifetime_credits_added, version)
  VALUES (p_user_id, p_amount, p_amount, 1)
  ON CONFLICT (user_id) DO UPDATE SET
    balance = public.account_credits.balance + p_amount,
    lifetime_credits_added = public.account_credits.lifetime_credits_added + p_amount,
    version = public.account_credits.version + 1,
    updated_at = NOW()
  RETURNING balance, version INTO v_new_balance, v_new_version;

  RETURN QUERY SELECT true, v_new_balance, v_new_version;
END;
$$ LANGUAGE plpgsql
SET search_path = '';
