UPDATE public.plans
SET max_upload_minutes = CASE slug
  WHEN 'free' THEN 30
  WHEN 'standard' THEN 90
  WHEN 'pro' THEN 180
  WHEN 'teams' THEN 240
  ELSE max_upload_minutes
END,
features_json = CASE slug
  WHEN 'free' THEN jsonb_set(
    COALESCE(features_json, '{}'::jsonb),
    '{feature_items}',
    '["Transcript","Speaker labels","Summary","One full 60-minute Repurpose Pack trial","1 content export","30-minute max upload","No credit card required"]'::jsonb,
    true
  )
  ELSE features_json
END,
updated_at = NOW()
WHERE slug IN ('free', 'standard', 'pro', 'teams');
