-- TossAutoPilot trading: reserved_orders + notification_settings + order_commands columns
-- Run after drizzle-kit push (or apply manually in Supabase SQL editor).

-- order_commands: reserved link
alter table public.order_commands
  add column if not exists reserved_order_id uuid;

-- reserved_orders
create table if not exists public.reserved_orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'armed',
  intent jsonb not null,
  auto_requeue boolean not null default true,
  requeue_count integer not null default 0,
  last_submit_session_date text,
  last_command_id uuid,
  last_exchange_order_id text,
  last_client_order_id text,
  last_error text,
  filled_quantity text default '0',
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists reserved_orders_user_status_idx
  on public.reserved_orders (user_id, status);

-- notification_settings
create table if not exists public.notification_settings (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  telegram_enabled boolean not null default false,
  telegram_chat_id text,
  telegram_bot_token_enc text,
  notify_on_reserve boolean not null default true,
  notify_on_submit boolean not null default true,
  notify_on_fill boolean not null default true,
  notify_on_cancel boolean not null default true,
  fill_track_json text,
  updated_at timestamptz not null default now()
);

alter table public.reserved_orders enable row level security;
alter table public.notification_settings enable row level security;

drop policy if exists "reserved_all_own" on public.reserved_orders;
create policy "reserved_all_own" on public.reserved_orders
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- notification: user may select/update own row but bot token ciphertext only via service
drop policy if exists "notif_select_own" on public.notification_settings;
create policy "notif_select_own" on public.notification_settings
  for select using (auth.uid() = user_id);

drop policy if exists "notif_insert_own" on public.notification_settings;
create policy "notif_insert_own" on public.notification_settings
  for insert with check (auth.uid() = user_id);

drop policy if exists "notif_update_own" on public.notification_settings;
create policy "notif_update_own" on public.notification_settings
  for update using (auth.uid() = user_id);

-- order cancel by user: allow update own pending commands
drop policy if exists "orders_update_own" on public.order_commands;
create policy "orders_update_own" on public.order_commands
  for update using (auth.uid() = user_id);
