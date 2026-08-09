-- quote_snapshots + RLS

create table if not exists public.quote_snapshots (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  quotes jsonb not null default '[]'::jsonb,
  symbol_count integer not null default 0,
  poll_interval_ms integer,
  last_error text,
  polled_at timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.quote_snapshots enable row level security;

drop policy if exists "quotes_select_own" on public.quote_snapshots;
create policy "quotes_select_own" on public.quote_snapshots
  for select using (auth.uid() = user_id);

-- writes: service_role (engine) only — no insert/update policy for authenticated
