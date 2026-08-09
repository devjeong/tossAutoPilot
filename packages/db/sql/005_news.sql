create table if not exists public.news_items (
  id text primary key,
  user_id uuid references public.profiles (id) on delete cascade,
  title text not null,
  summary text,
  url text,
  source_name text not null,
  source_tier text not null default 'unknown',
  is_kadara boolean not null default true,
  market text default 'ALL',
  symbols jsonb not null default '[]'::jsonb,
  published_at timestamptz,
  collected_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists news_items_collected_idx
  on public.news_items (collected_at desc);

create index if not exists news_items_user_idx
  on public.news_items (user_id, collected_at desc);

alter table public.news_items enable row level security;

-- 사용자 소속 뉴스 + 공용(user_id null) 조회
drop policy if exists "news_select" on public.news_items;
create policy "news_select" on public.news_items
  for select using (user_id is null or auth.uid() = user_id);
