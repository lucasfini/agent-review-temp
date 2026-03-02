-- ============================================================================
-- Pay-as-You-Go Billing System
-- ============================================================================
-- Tracks user credit balances and usage events for all AI service costs
-- Created: 2025-01-15

-- ============================================================================
-- Account Credits Table
-- ============================================================================
-- Stores credit balance for each user with optimistic locking

CREATE TABLE IF NOT EXISTS account_credits (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  balance DECIMAL(10,4) NOT NULL DEFAULT 0 CHECK (balance >= 0),
  version INTEGER NOT NULL DEFAULT 0, -- Optimistic locking for concurrent updates
  lifetime_credits_added DECIMAL(10,4) DEFAULT 0, -- Total credits ever added
  lifetime_credits_spent DECIMAL(10,4) DEFAULT 0, -- Total credits ever spent
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT unique_user_credits UNIQUE (user_id)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_account_credits_user ON account_credits(user_id);
CREATE INDEX IF NOT EXISTS idx_account_credits_balance ON account_credits(balance) WHERE balance > 0;

-- Comments for documentation
COMMENT ON TABLE account_credits IS 'User credit balances for pay-as-you-go billing';
COMMENT ON COLUMN account_credits.balance IS 'Current available credits in USD';
COMMENT ON COLUMN account_credits.version IS 'Optimistic locking version to prevent race conditions';
COMMENT ON COLUMN account_credits.lifetime_credits_added IS 'Total credits added (purchases + bonuses)';
COMMENT ON COLUMN account_credits.lifetime_credits_spent IS 'Total credits spent on AI services';

-- ============================================================================
-- Usage Events Table
-- ============================================================================
-- Logs every AI service usage with raw and billed costs

CREATE TABLE IF NOT EXISTS usage_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,

  -- Service identification
  service_key TEXT NOT NULL, -- e.g., 'assemblyai_transcription', 'openai_gpt4o_mini_input'
  service_name TEXT NOT NULL, -- Human-readable name
  provider TEXT NOT NULL, -- 'assemblyai', 'openai', 'anthropic', 'perplexity'

  -- Usage measurement
  units DECIMAL(12,6) NOT NULL, -- Quantity consumed (seconds, tokens, etc.)
  unit_type TEXT NOT NULL, -- 'seconds', 'input_tokens', 'output_tokens', etc.

  -- Cost tracking
  raw_cost DECIMAL(10,6) NOT NULL, -- Provider cost (before markup)
  margin_percent DECIMAL(5,2) NOT NULL DEFAULT 35.00, -- Markup percentage applied
  billed_cost DECIMAL(10,6) NOT NULL, -- Final cost charged to user

  -- Metadata and context
  metadata JSONB DEFAULT '{}', -- Additional service-specific data
  debit_transaction_id UUID, -- Reference to credit debit (if separate table)
  status TEXT DEFAULT 'completed' CHECK (status IN ('completed', 'pending', 'failed', 'refunded')),

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at TIMESTAMPTZ
);

-- Indexes for querying and analytics
CREATE INDEX IF NOT EXISTS idx_usage_events_user_date ON usage_events(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_usage_events_project ON usage_events(project_id) WHERE project_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_usage_events_service ON usage_events(service_key, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_usage_events_provider ON usage_events(provider, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_usage_events_status ON usage_events(status) WHERE status != 'completed';

-- Comments
COMMENT ON TABLE usage_events IS 'Log of all AI service usage and associated costs';
COMMENT ON COLUMN usage_events.service_key IS 'Unique identifier for the service (matches cost_map.ts)';
COMMENT ON COLUMN usage_events.units IS 'Quantity consumed in unit_type units';
COMMENT ON COLUMN usage_events.raw_cost IS 'Actual provider cost before markup';
COMMENT ON COLUMN usage_events.billed_cost IS 'Cost charged to user (raw_cost * (1 + margin/100))';
COMMENT ON COLUMN usage_events.metadata IS 'Service-specific data: model, duration, token counts, etc.';

-- ============================================================================
-- Credit Transactions Table (Optional - for audit trail)
-- ============================================================================
-- Tracks all credit additions and deductions for full audit history

CREATE TABLE IF NOT EXISTS credit_transactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Transaction details
  amount DECIMAL(10,4) NOT NULL, -- Positive for additions, negative for deductions
  balance_before DECIMAL(10,4) NOT NULL,
  balance_after DECIMAL(10,4) NOT NULL,

  -- Transaction type
  transaction_type TEXT NOT NULL CHECK (transaction_type IN ('purchase', 'bonus', 'refund', 'debit', 'admin_adjustment')),

  -- References
  usage_event_id UUID REFERENCES usage_events(id) ON DELETE SET NULL,
  payment_id TEXT, -- Stripe payment intent ID or similar
  invoice_number TEXT, -- Stripe invoice ID/number for purchases/refunds
  admin_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,

  -- Context
  reason TEXT,
  metadata JSONB DEFAULT '{}',

  -- Timestamp
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_credit_transactions_user_date ON credit_transactions(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_credit_transactions_type ON credit_transactions(transaction_type);
CREATE INDEX IF NOT EXISTS idx_credit_transactions_usage_event ON credit_transactions(usage_event_id) WHERE usage_event_id IS NOT NULL;

-- Comments
COMMENT ON TABLE credit_transactions IS 'Complete audit log of all credit balance changes';
COMMENT ON COLUMN credit_transactions.amount IS 'Change amount: positive for credits added, negative for debits';
COMMENT ON COLUMN credit_transactions.transaction_type IS 'purchase=Stripe, bonus=promo, debit=usage, admin_adjustment=manual';
COMMENT ON COLUMN credit_transactions.invoice_number IS 'Stripe invoice number/id for payment transactions';

-- ============================================================================
-- Row Level Security (RLS)
-- ============================================================================

-- Enable RLS
ALTER TABLE account_credits ENABLE ROW LEVEL SECURITY;
ALTER TABLE usage_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE credit_transactions ENABLE ROW LEVEL SECURITY;

-- Account Credits Policies
CREATE POLICY "Users can view own credits" ON account_credits
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can update own credits" ON account_credits
  FOR UPDATE USING (auth.uid() = user_id);

-- Usage Events Policies
CREATE POLICY "Users can view own usage events" ON usage_events
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Service role can insert usage events" ON usage_events
  FOR INSERT WITH CHECK (true); -- Requires service role key

-- Credit Transactions Policies
CREATE POLICY "Users can view own transactions" ON credit_transactions
  FOR SELECT USING (auth.uid() = user_id);

-- ============================================================================
-- Helper Functions
-- ============================================================================

-- Function to safely debit credits with optimistic locking
CREATE OR REPLACE FUNCTION debit_user_credits(
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
  -- Lock the row for update
  SELECT balance, version INTO v_current_balance, v_current_version
  FROM account_credits
  WHERE user_id = p_user_id
  FOR UPDATE;

  -- Check if record exists
  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 0::DECIMAL(10,4), 0, 'User credit account not found';
    RETURN;
  END IF;

  -- Check version match (optimistic locking)
  IF v_current_version != p_current_version THEN
    RETURN QUERY SELECT false, v_current_balance, v_current_version, 'Version mismatch - concurrent update detected';
    RETURN;
  END IF;

  -- Check sufficient balance
  IF v_current_balance < p_amount THEN
    RETURN QUERY SELECT false, v_current_balance, v_current_version,
      format('Insufficient credits: have $%s, need $%s', v_current_balance, p_amount);
    RETURN;
  END IF;

  -- Calculate new values
  v_new_balance := v_current_balance - p_amount;
  v_new_version := v_current_version + 1;

  -- Update the balance
  UPDATE account_credits
  SET
    balance = v_new_balance,
    version = v_new_version,
    lifetime_credits_spent = lifetime_credits_spent + p_amount,
    updated_at = NOW()
  WHERE user_id = p_user_id;

  -- Return success
  RETURN QUERY SELECT true, v_new_balance, v_new_version, NULL::TEXT;
END;
$$ LANGUAGE plpgsql;

-- Function to add credits
CREATE OR REPLACE FUNCTION add_user_credits(
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
  -- Insert or update credits
  INSERT INTO account_credits (user_id, balance, lifetime_credits_added, version)
  VALUES (p_user_id, p_amount, p_amount, 1)
  ON CONFLICT (user_id) DO UPDATE SET
    balance = account_credits.balance + p_amount,
    lifetime_credits_added = account_credits.lifetime_credits_added + p_amount,
    version = account_credits.version + 1,
    updated_at = NOW()
  RETURNING balance, version INTO v_new_balance, v_new_version;

  RETURN QUERY SELECT true, v_new_balance, v_new_version;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- Initial Setup
-- ============================================================================

-- Grant permissions
GRANT SELECT ON account_credits TO authenticated;
GRANT UPDATE ON account_credits TO authenticated;
GRANT SELECT ON usage_events TO authenticated;
GRANT SELECT ON credit_transactions TO authenticated;

-- Grant service role full access
GRANT ALL ON account_credits TO service_role;
GRANT ALL ON usage_events TO service_role;
GRANT ALL ON credit_transactions TO service_role;

-- Create view for user balance summary
CREATE OR REPLACE VIEW user_credit_summary AS
SELECT
  ac.user_id,
  ac.balance as current_balance,
  ac.lifetime_credits_added,
  ac.lifetime_credits_spent,
  ac.updated_at as last_activity,
  COUNT(DISTINCT ue.id) as total_usage_events,
  COUNT(DISTINCT ue.project_id) as projects_with_usage,
  COALESCE(SUM(ue.billed_cost), 0) as total_billed_this_period
FROM account_credits ac
LEFT JOIN usage_events ue ON ac.user_id = ue.user_id
  AND ue.created_at > NOW() - INTERVAL '30 days'
GROUP BY ac.user_id, ac.balance, ac.lifetime_credits_added, ac.lifetime_credits_spent, ac.updated_at;

GRANT SELECT ON user_credit_summary TO authenticated;
GRANT SELECT ON user_credit_summary TO service_role;

-- Done!
COMMENT ON SCHEMA public IS 'Billing system schema created - ready for pay-as-you-go usage tracking';
