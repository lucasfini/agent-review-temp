ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS welcome_credits_granted_at TIMESTAMPTZ;

COMMENT ON COLUMN public.profiles.welcome_credits_granted_at
  IS 'Timestamp when the one-time signup welcome credit bonus was granted.';

CREATE OR REPLACE FUNCTION public.grant_signup_bonus(
  p_user_id UUID,
  p_amount NUMERIC,
  p_reason TEXT DEFAULT 'Welcome signup bonus'
)
RETURNS TABLE(
  granted BOOLEAN,
  new_balance NUMERIC,
  transaction_id UUID
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_marked_user UUID;
  v_balance_before NUMERIC(10,4);
  v_new_balance NUMERIC(10,4);
  v_transaction_id UUID;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Signup bonus amount must be positive';
  END IF;

  UPDATE public.profiles
  SET welcome_credits_granted_at = NOW(),
      updated_at = NOW()
  WHERE id = p_user_id
    AND welcome_credits_granted_at IS NULL
  RETURNING id INTO v_marked_user;

  IF v_marked_user IS NULL THEN
    SELECT COALESCE(ac.balance, 0)
    INTO v_new_balance
    FROM public.account_credits ac
    WHERE ac.user_id = p_user_id;

    RETURN QUERY SELECT FALSE, COALESCE(v_new_balance, 0), NULL::UUID;
    RETURN;
  END IF;

  SELECT COALESCE(ac.balance, 0)
  INTO v_balance_before
  FROM public.account_credits ac
  WHERE ac.user_id = p_user_id;

  INSERT INTO public.account_credits (
    user_id,
    balance,
    lifetime_credits_added,
    version
  )
  VALUES (
    p_user_id,
    p_amount,
    p_amount,
    1
  )
  ON CONFLICT (user_id) DO UPDATE
  SET balance = public.account_credits.balance + p_amount,
      lifetime_credits_added = public.account_credits.lifetime_credits_added + p_amount,
      version = public.account_credits.version + 1,
      updated_at = NOW()
  RETURNING balance INTO v_new_balance;

  INSERT INTO public.credit_transactions (
    user_id,
    amount,
    balance_before,
    balance_after,
    transaction_type,
    reason,
    metadata
  )
  VALUES (
    p_user_id,
    p_amount,
    COALESCE(v_balance_before, 0),
    v_new_balance,
    'bonus',
    p_reason,
    jsonb_build_object(
      'source', 'signup_bonus',
      'grant_usd', p_amount
    )
  )
  RETURNING id INTO v_transaction_id;

  RETURN QUERY SELECT TRUE, v_new_balance, v_transaction_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.grant_signup_bonus(UUID, NUMERIC, TEXT) TO service_role;
