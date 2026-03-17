CREATE TABLE IF NOT EXISTS public.user_openai_settings (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  api_key_enc text,
  use_personal_key boolean NOT NULL DEFAULT false,
  openai_enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.user_openai_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own OpenAI settings" ON public.user_openai_settings
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own OpenAI settings" ON public.user_openai_settings
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own OpenAI settings" ON public.user_openai_settings
  FOR UPDATE USING (auth.uid() = user_id);

GRANT SELECT, INSERT, UPDATE ON public.user_openai_settings TO authenticated;
GRANT ALL ON public.user_openai_settings TO service_role;
