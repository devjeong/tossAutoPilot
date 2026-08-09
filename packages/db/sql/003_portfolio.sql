create table if not exists public.portfolio_snapshots (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  snapshot jsonb not null default '{}'::jsonb,
  last_error text,
  polled_at timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.portfolio_snapshots enable row level security;

drop policy if exists "portfolio_select_own" on public.portfolio_snapshots;
create policy "portfolio_select_own" on public.portfolio_snapshots
  for select using (auth.uid() = user_id);
