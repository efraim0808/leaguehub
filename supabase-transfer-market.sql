-- Transfer Pazarı tablosu
create table if not exists public.transfer_market (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  full_name text not null,
  hospital text not null,
  position text not null check (position in ('KL', 'DEF', 'ORT', 'FOR')),
  phone text not null,
  avatar_url text,
  created_at timestamptz not null default now()
);

create index if not exists idx_transfer_market_created_at
  on public.transfer_market (created_at desc);

create index if not exists idx_transfer_market_position
  on public.transfer_market (position);

alter table public.transfer_market enable row level security;

create policy if not exists "Transfer market public read access"
  on public.transfer_market
  for select
  using (true);

create policy if not exists "Users can insert own transfer profile"
  on public.transfer_market
  for insert
  with check (auth.uid() = user_id);

create policy if not exists "Users can update own transfer profile"
  on public.transfer_market
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy if not exists "Users can delete own transfer profile"
  on public.transfer_market
  for delete
  using (auth.uid() = user_id);
