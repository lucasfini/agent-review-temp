-- Phase 5B: encrypted Slack token storage for internal agency client integrations.
-- Tokens are encrypted by the application before persistence and remain behind
-- the existing client_integrations internal-agency RLS policies.

ALTER TABLE public.client_integrations
  ADD COLUMN IF NOT EXISTS access_token_enc TEXT,
  ADD COLUMN IF NOT EXISTS refresh_token_enc TEXT,
  ADD COLUMN IF NOT EXISTS token_type TEXT,
  ADD COLUMN IF NOT EXISTS token_scopes TEXT[] NOT NULL DEFAULT '{}'::TEXT[],
  ADD COLUMN IF NOT EXISTS token_expires_at TIMESTAMPTZ;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'client_integrations_token_scopes_not_null'
      AND conrelid = 'public.client_integrations'::regclass
  ) THEN
    ALTER TABLE public.client_integrations
      ADD CONSTRAINT client_integrations_token_scopes_not_null
      CHECK (token_scopes IS NOT NULL);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_client_integrations_provider_status
  ON public.client_integrations(provider, status);
