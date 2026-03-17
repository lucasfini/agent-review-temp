ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS username text,
  ADD COLUMN IF NOT EXISTS first_name text,
  ADD COLUMN IF NOT EXISTS last_name text;

CREATE UNIQUE INDEX IF NOT EXISTS profiles_username_unique_idx
  ON public.profiles (lower(username))
  WHERE username IS NOT NULL AND btrim(username) <> '';

CREATE TABLE IF NOT EXISTS public.contact_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  email text NOT NULL,
  category text NOT NULL,
  severity text NOT NULL DEFAULT 'normal',
  affected_page text,
  service_area text,
  project_title text,
  subject text NOT NULL,
  message text NOT NULL,
  screenshot_url text,
  status text NOT NULL DEFAULT 'open',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.contact_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can insert own contact requests" ON public.contact_requests
  FOR INSERT
  WITH CHECK (auth.uid() = user_id OR user_id IS NULL);

CREATE POLICY "Users can view own contact requests" ON public.contact_requests
  FOR SELECT
  USING (auth.uid() = user_id);

GRANT SELECT, INSERT ON public.contact_requests TO authenticated;
GRANT ALL ON public.contact_requests TO service_role;
