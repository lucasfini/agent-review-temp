-- Durable Stripe webhook event ledger and full-range admin billing totals.

create table if not exists public.stripe_webhook_events (
  id uuid primary key default gen_random_uuid(),
  event_id text not null unique,
  event_type text not null,
  livemode boolean not null default false,
  api_version text,
  object_id text,
  status text not null default 'received' check (status in ('received', 'processing', 'processed', 'failed', 'ignored')),
  attempts integer not null default 0,
  received_at timestamptz not null default now(),
  processing_started_at timestamptz,
  processed_at timestamptz,
  last_error text,
  payload jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_stripe_webhook_events_type_created
  on public.stripe_webhook_events (event_type, created_at desc);

create index if not exists idx_stripe_webhook_events_status_created
  on public.stripe_webhook_events (status, created_at desc);

create or replace function public.set_stripe_webhook_events_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_stripe_webhook_events_updated_at on public.stripe_webhook_events;
create trigger trg_stripe_webhook_events_updated_at
before update on public.stripe_webhook_events
for each row
execute function public.set_stripe_webhook_events_updated_at();

alter table public.stripe_webhook_events enable row level security;

-- No user-facing read/write policy is added. Server routes use the Supabase service role.

create or replace function public.get_admin_billing_totals(
  p_since timestamptz default null,
  p_search text default null
)
returns table (
  purchases numeric,
  refunds numeric,
  debits numeric
)
language sql
security definer
set search_path = public
as $$
  select
    coalesce(sum(case when transaction_type = 'purchase' then amount else 0 end), 0)::numeric as purchases,
    coalesce(sum(case when transaction_type = 'refund' then abs(amount) else 0 end), 0)::numeric as refunds,
    coalesce(sum(case when transaction_type = 'debit' then abs(amount) else 0 end), 0)::numeric as debits
  from public.credit_transactions
  where (p_since is null or created_at >= p_since)
    and (
      p_search is null
      or reason ilike ('%' || p_search || '%')
      or transaction_type ilike ('%' || p_search || '%')
      or invoice_number ilike ('%' || p_search || '%')
    );
$$;

revoke all on function public.get_admin_billing_totals(timestamptz, text) from public;
revoke all on function public.get_admin_billing_totals(timestamptz, text) from anon;
revoke all on function public.get_admin_billing_totals(timestamptz, text) from authenticated;
grant execute on function public.get_admin_billing_totals(timestamptz, text) to service_role;

create or replace function public.grant_stripe_purchase_credits(
  p_user_id uuid,
  p_amount numeric,
  p_payment_id text default null,
  p_session_id text default null,
  p_invoice_number text default null,
  p_reason text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns table (
  success boolean,
  already_processed boolean,
  new_balance numeric,
  new_version integer,
  transaction_id uuid
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_idempotency_key text;
  v_existing_transaction record;
  v_balance_before numeric := 0;
  v_new_balance numeric := 0;
  v_new_version integer := 0;
  v_transaction_id uuid;
  v_metadata jsonb;
begin
  if p_user_id is null then
    raise exception 'p_user_id is required';
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'p_amount must be positive';
  end if;

  v_idempotency_key := coalesce(nullif(p_payment_id, ''), nullif(p_session_id, ''));
  if v_idempotency_key is null then
    raise exception 'p_payment_id or p_session_id is required';
  end if;

  perform pg_advisory_xact_lock(hashtext('stripe_purchase'), hashtext(v_idempotency_key));

  select id, balance_after
  into v_existing_transaction
  from public.credit_transactions
  where user_id = p_user_id
    and transaction_type = 'purchase'
    and (
      (nullif(p_payment_id, '') is not null and payment_id = nullif(p_payment_id, ''))
      or (nullif(p_session_id, '') is not null and metadata ->> 'sessionId' = nullif(p_session_id, ''))
    )
  order by created_at asc
  limit 1
  for update;

  if found then
    return query
      select true, true, v_existing_transaction.balance_after, null::integer, v_existing_transaction.id;
    return;
  end if;

  v_metadata := coalesce(p_metadata, '{}'::jsonb);
  if nullif(p_session_id, '') is not null then
    v_metadata := v_metadata || jsonb_build_object('sessionId', nullif(p_session_id, ''));
  end if;

  select balance
  into v_balance_before
  from public.account_credits
  where user_id = p_user_id
  for update;

  if not found then
    insert into public.account_credits (user_id, balance, lifetime_credits_added, version)
    values (p_user_id, p_amount, p_amount, 1)
    returning balance, version into v_new_balance, v_new_version;
    v_balance_before := 0;
  else
    update public.account_credits
    set
      balance = public.account_credits.balance + p_amount,
      lifetime_credits_added = public.account_credits.lifetime_credits_added + p_amount,
      version = public.account_credits.version + 1,
      updated_at = now()
    where user_id = p_user_id
    returning balance, version into v_new_balance, v_new_version;
  end if;

  insert into public.credit_transactions (
    user_id,
    amount,
    balance_before,
    balance_after,
    transaction_type,
    payment_id,
    invoice_number,
    reason,
    metadata
  )
  values (
    p_user_id,
    p_amount,
    v_balance_before,
    v_new_balance,
    'purchase',
    nullif(p_payment_id, ''),
    nullif(p_invoice_number, ''),
    p_reason,
    v_metadata
  )
  returning id into v_transaction_id;

  return query
    select true, false, v_new_balance, v_new_version, v_transaction_id;
end;
$$;

revoke all on function public.grant_stripe_purchase_credits(uuid, numeric, text, text, text, text, jsonb) from public;
revoke all on function public.grant_stripe_purchase_credits(uuid, numeric, text, text, text, text, jsonb) from anon;
revoke all on function public.grant_stripe_purchase_credits(uuid, numeric, text, text, text, text, jsonb) from authenticated;
grant execute on function public.grant_stripe_purchase_credits(uuid, numeric, text, text, text, text, jsonb) to service_role;
