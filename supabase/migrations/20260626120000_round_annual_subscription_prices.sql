UPDATE public.plans
SET
  stripe_annual_price_id = 'price_1TktAoCsRaVYgQwjMNTPo6B4',
  annual_price_cents = 50388,
  currency = 'usd',
  updated_at = now()
WHERE slug = 'standard';

UPDATE public.plans
SET
  stripe_annual_price_id = 'price_1TktBNCsRaVYgQwjUjAczqHC',
  annual_price_cents = 151200,
  currency = 'usd',
  updated_at = now()
WHERE slug = 'pro';

UPDATE public.plans
SET
  stripe_annual_price_id = 'price_1TktBoCsRaVYgQwjlh3PHmIj',
  annual_price_cents = 406800,
  currency = 'usd',
  updated_at = now()
WHERE slug = 'teams';
