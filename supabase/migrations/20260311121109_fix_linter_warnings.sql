
-- Fixes for Supabase Database Linter Warnings

-- 1. Security Definer Views
-- Explanation: Ensures views enforce the permissions of the querying user instead of the view creator.
ALTER VIEW public.user_credit_summary SET (security_invoker = on);
ALTER VIEW public.project_cost_analytics SET (security_invoker = on);
ALTER VIEW public.project_content_analytics SET (security_invoker = on);

-- 2. RLS Disabled in Public & Enabled No Policy
-- Explanation: Enable RLS and add basic security policies.

-- transcription_cache
ALTER TABLE public.transcription_cache ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access transcription" ON public.transcription_cache FOR ALL TO service_role USING (true) WITH CHECK (true);

-- content_generation_cache
-- It already has RLS enabled, just missing policies
CREATE POLICY "Service role full access content_gen" ON public.content_generation_cache FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Users can view own project cache" ON public.content_generation_cache 
  FOR SELECT TO authenticated 
  USING (EXISTS (SELECT 1 FROM public.projects p WHERE p.id = content_generation_cache.project_id AND p.user_id = auth.uid()));

-- insights
ALTER TABLE public.insights ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access insights" ON public.insights FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Users can manage own insights" ON public.insights 
  FOR ALL TO authenticated 
  USING (EXISTS (SELECT 1 FROM public.projects p WHERE p.id = insights.project_id AND p.user_id = auth.uid())) 
  WITH CHECK (EXISTS (SELECT 1 FROM public.projects p WHERE p.id = insights.project_id AND p.user_id = auth.uid()));

-- 3. Function Search Path Mutable
-- Explanation: Prevents role mutable search path attacks.
ALTER FUNCTION public.update_insights_updated_at() SET search_path = '';
ALTER FUNCTION public.debit_user_credits(uuid, numeric, integer) SET search_path = '';
ALTER FUNCTION public.add_user_credits(uuid, numeric, text) SET search_path = '';
ALTER FUNCTION public.handle_new_user() SET search_path = '';
ALTER FUNCTION public.update_updated_at() SET search_path = '';

-- 4. RLS Policy Always True
-- Explanation: Restrict overly permissive policies to only the intended roles.

-- usage_events
DROP POLICY IF EXISTS "Service role can insert usage events" ON public.usage_events;
CREATE POLICY "Service role can insert usage events" ON public.usage_events FOR INSERT TO service_role WITH CHECK (true);

-- waitlist
DROP POLICY IF EXISTS "Anyone can join waitlist" ON public.waitlist;
CREATE POLICY "Anyone can join waitlist" ON public.waitlist FOR INSERT TO anon, authenticated WITH CHECK (true);
