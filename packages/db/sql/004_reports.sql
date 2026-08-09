create table if not exists public.market_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null default 'market_brief_both',
  status text not null default 'completed',
  title text not null,
  body_markdown text not null,
  provider text,
  model text,
  kadara_count integer not null default 0,
  payload jsonb not null default '{}'::jsonb,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists market_reports_user_created_idx
  on public.market_reports (user_id, created_at desc);

alter table public.market_reports enable row level security;

drop policy if exists "reports_select_own" on public.market_reports;
create policy "reports_select_own" on public.market_reports
  for select using (auth.uid() = user_id);

drop policy if exists "reports_insert_own" on public.market_reports;
create policy "reports_insert_own" on public.market_reports
  for insert with check (auth.uid() = user_id);
