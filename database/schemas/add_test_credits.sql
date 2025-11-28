-- Add 10 credits to your test user account
-- User ID: 4deedc66-7b15-4e86-8e64-bcae53da2c0d

INSERT INTO account_credits (user_id, balance, lifetime_credits_added, version)
VALUES ('4deedc66-7b15-4e86-8e64-bcae53da2c0d', 10.0, 10.0, 1)
ON CONFLICT (user_id) DO UPDATE SET
  balance = account_credits.balance + 10.0,
  lifetime_credits_added = account_credits.lifetime_credits_added + 10.0,
  version = account_credits.version + 1,
  updated_at = NOW();

-- Also create a transaction record
INSERT INTO credit_transactions (user_id, amount, balance_before, balance_after, transaction_type, reason)
SELECT
  user_id,
  10.0,
  COALESCE(balance - 10.0, 0),
  balance,
  'admin_adjustment',
  'Manual test credit addition'
FROM account_credits
WHERE user_id = '4deedc66-7b15-4e86-8e64-bcae53da2c0d';
