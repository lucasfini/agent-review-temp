-- Add invoice_number to credit_transactions for payment invoice tracking
ALTER TABLE credit_transactions
ADD COLUMN IF NOT EXISTS invoice_number TEXT;

COMMENT ON COLUMN credit_transactions.invoice_number IS 'Stripe invoice number/id for payment transactions';
