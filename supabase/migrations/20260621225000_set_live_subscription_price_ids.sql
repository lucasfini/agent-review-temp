UPDATE public.plans
SET
  stripe_monthly_price_id = 'price_1Tkt6GCsRaVYgQwjkJLVwSDf',
  stripe_annual_price_id = 'price_1TktAoCsRaVYgQwjMNTPo6B4',
  monthly_price_cents = 4999,
  annual_price_cents = 50990,
  currency = 'usd',
  updated_at = now()
WHERE slug = 'standard';

UPDATE public.plans
SET
  stripe_monthly_price_id = 'price_1Tkt6vCsRaVYgQwjgHq2bCEI',
  stripe_annual_price_id = 'price_1TktBNCsRaVYgQwjUjAczqHC',
  monthly_price_cents = 14900,
  annual_price_cents = 151980,
  currency = 'usd',
  updated_at = now()
WHERE slug = 'pro';

UPDATE public.plans
SET
  stripe_monthly_price_id = 'price_1Tkt7TCsRaVYgQwjhHX3uDSn',
  stripe_annual_price_id = 'price_1TktBoCsRaVYgQwjlh3PHmIj',
  monthly_price_cents = 39900,
  annual_price_cents = 406980,
  currency = 'usd',
  updated_at = now()
WHERE slug = 'teams';
