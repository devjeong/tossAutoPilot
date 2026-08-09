-- TossAutoPilot M1: Auth bootstrap + RLS
-- Run after drizzle-kit push (tables exist).

-- ── Profile auto-create on signup ─────────────────────────────────
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1))
  )
  on conflict (id) do nothing;

  insert into public.engine_status (user_id, mode, state)
  values (new.id, 'paper', 'stopped')
  on conflict (user_id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ── RLS ───────────────────────────────────────────────────────────
alter table public.profiles enable row level security;
alter table public.api_credentials enable row level security;
alter table public.engine_status enable row level security;
alter table public.watchlist_items enable row level security;
alter table public.strategies enable row level security;
alter table public.order_commands enable row level security;
alter table public.journal_entries enable row level security;

-- profiles
drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own" on public.profiles
  for select using (auth.uid() = id);

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own" on public.profiles
  for insert with check (auth.uid() = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles
  for update using (auth.uid() = id);

-- engine_status
drop policy if exists "engine_select_own" on public.engine_status;
create policy "engine_select_own" on public.engine_status
  for select using (auth.uid() = user_id);

drop policy if exists "engine_insert_own" on public.engine_status;
create policy "engine_insert_own" on public.engine_status
  for insert with check (auth.uid() = user_id);

drop policy if exists "engine_update_own" on public.engine_status;
create policy "engine_update_own" on public.engine_status
  for update using (auth.uid() = user_id);

-- watchlist
drop policy if exists "watchlist_all_own" on public.watchlist_items;
create policy "watchlist_all_own" on public.watchlist_items
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- strategies
drop policy if exists "strategies_all_own" on public.strategies;
create policy "strategies_all_own" on public.strategies
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- order_commands: user can insert/select own; worker uses service_role
drop policy if exists "orders_select_own" on public.order_commands;
create policy "orders_select_own" on public.order_commands
  for select using (auth.uid() = user_id);

drop policy if exists "orders_insert_own" on public.order_commands;
create policy "orders_insert_own" on public.order_commands
  for insert with check (auth.uid() = user_id);

-- journal: read own only (writes via service_role / worker)
drop policy if exists "journal_select_own" on public.journal_entries;
create policy "journal_select_own" on public.journal_entries
  for select using (auth.uid() = user_id);

-- api_credentials: NO client select of ciphertext.
-- Only allow meta existence check via a view later; block all for authenticated.
drop policy if exists "credentials_deny_all" on public.api_credentials;
-- No policies for authenticated = deny by default when RLS on.
-- service_role bypasses RLS.

-- ── unique watchlist ──────────────────────────────────────────────
create unique index if not exists watchlist_user_symbol_uidx
  on public.watchlist_items (user_id, symbol);
