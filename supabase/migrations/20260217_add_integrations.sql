create table if not exists public.integration_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null,
  external_account_id text not null,
  status text not null default 'connected',
  scopes text[] null,
  access_token_enc text null,
  refresh_token_enc text null,
  expires_at timestamptz null,
  metadata jsonb null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_sync_at timestamptz null
);

create unique index if not exists integration_connections_unique
  on public.integration_connections (user_id, provider);

create table if not exists public.integration_imports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null,
  external_recording_id text not null,
  project_id uuid null references public.projects(id) on delete set null,
  status text not null default 'imported',
  error text null,
  created_at timestamptz not null default now()
);

create unique index if not exists integration_imports_dedupe
  on public.integration_imports (user_id, provider, external_recording_id);

alter table public.integration_connections enable row level security;
alter table public.integration_imports enable row level security;

drop policy if exists "Users can view own integration connections" on public.integration_connections;
create policy "Users can view own integration connections" on public.integration_connections
  for select using (auth.uid() = user_id);

drop policy if exists "Users can manage own integration connections" on public.integration_connections;
create policy "Users can manage own integration connections" on public.integration_connections
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "Users can view own integration imports" on public.integration_imports;
create policy "Users can view own integration imports" on public.integration_imports
  for select using (auth.uid() = user_id);

drop policy if exists "Users can manage own integration imports" on public.integration_imports;
create policy "Users can manage own integration imports" on public.integration_imports
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
