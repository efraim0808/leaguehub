-- =========================================================
-- LeagueHub Supabase schema (full starter setup)
-- =========================================================

create extension if not exists pgcrypto;

-- =========================================================
-- Enums
-- =========================================================
create type public.role_type as enum (
  'Super Admin',
  'Admin',
  'Team Manager',
  'Visitor'
);

create type public.tournament_status as enum (
  'Kayıt Açık',
  'Turnuva Başladı',
  'Turnuva Bitti'
);

create type public.fixture_status as enum (
  'Planlandı',
  'Devam Ediyor',
  'Tamamlandı'
);

create type public.match_status as enum (
  'Başlatıldı',
  'Durduruldu',
  'Bitti'
);

create type public.team_status as enum (
  'Onaylı',
  'Beklemede',
  'Reddedildi'
);

create type public.match_event_type as enum (
  'goal',
  'yellow',
  'red',
  'substitution'
);

-- =========================================================
-- Base tables
-- =========================================================
create table if not exists public.teams (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  short_name text not null,
  city text not null,
  status public.team_status not null default 'Beklemede',
  manager_id uuid not null,
  logo_url text,
  created_at timestamptz not null default now()
);

create table if not exists public.users (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  email text not null unique,
  password text not null,
  username text not null unique,
  role public.role_type not null default 'Visitor',
  is_active boolean not null default true,
  kvkk_accepted boolean not null default false,
  phone text,
  tc text,
  team_id uuid null,
  team_manager_request boolean not null default false,
  permissions jsonb not null default '{
    "fikstur": false,
    "puanDurumu": false,
    "canliSkor": false,
    "disiplin": false,
    "takimOnaylari": false,
    "takimYonetimi": false,
    "galeri": false,
    "duyurular": false,
    "ayarlar": false
  }'::jsonb,
  created_at timestamptz not null default now(),
  constraint users_team_fk foreign key (team_id) references public.teams(id) on delete set null,
  constraint users_manager_fk foreign key (manager_id) references public.users(id) on delete cascade
);

alter table public.teams
  add constraint if not exists teams_manager_fk
  foreign key (manager_id) references public.users(id) on delete cascade;

create table if not exists public.players (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  name text not null,
  unit text not null,
  phone text not null,
  tc text not null,
  photo_url text,
  yellow_cards integer not null default 0,
  red_cards integer not null default 0,
  is_suspended boolean not null default false,
  is_captain boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.tournaments (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  status public.tournament_status not null default 'Kayıt Açık',
  start_date date not null,
  rules text,
  scoring jsonb not null default '{"win": 3, "draw": 1, "loss": 0}'::jsonb,
  registered_team_ids uuid[] not null default '{}',
  yellow_card_rule integer not null default 2,
  teams uuid[] not null default '{}',
  created_at timestamptz not null default now()
);

create table if not exists public.fixtures (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  home_team_id uuid not null references public.teams(id) on delete cascade,
  away_team_id uuid not null references public.teams(id) on delete cascade,
  fixture_date date not null,
  fixture_time time not null,
  venue text not null,
  status public.fixture_status not null default 'Planlandı',
  home_score integer not null default 0,
  away_score integer not null default 0,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.matches (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  fixture_id uuid not null references public.fixtures(id) on delete cascade,
  home_team_id uuid not null references public.teams(id) on delete cascade,
  away_team_id uuid not null references public.teams(id) on delete cascade,
  home_score integer not null default 0,
  away_score integer not null default 0,
  status public.match_status not null default 'Başlatıldı',
  elapsed_minutes integer not null default 0,
  mvp_player_id uuid null,
  week text,
  match_date date,
  match_time time,
  venue text,
  created_at timestamptz not null default now()
);

create table if not exists public.match_events (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches(id) on delete cascade,
  type public.match_event_type not null,
  minute integer not null default 0,
  team_id uuid not null references public.teams(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  description text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.match_statistics (
  id text primary key,
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  match_id uuid not null references public.matches(id) on delete cascade,
  team_id uuid not null references public.teams(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  player_name text not null default '',
  goals integer not null default 0,
  yellow_cards integer not null default 0,
  red_cards integer not null default 0,
  substitutions integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.player_match_stats (
  id text primary key,
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  match_id uuid not null references public.matches(id) on delete cascade,
  team_id uuid not null references public.teams(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  player_name text not null default '',
  goals integer not null default 0,
  yellow_cards integer not null default 0,
  red_cards integer not null default 0,
  substitutions integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.discipline_records (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players(id) on delete cascade,
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  yellow_cards integer not null default 0,
  red_cards integer not null default 0,
  suspension_matches integer not null default 0,
  reason text,
  created_at timestamptz not null default now()
);

create index if not exists idx_discipline_records_player_id
  on public.discipline_records (player_id);

create index if not exists idx_discipline_records_tournament_id
  on public.discipline_records (tournament_id);

create index if not exists idx_discipline_records_player_tournament
  on public.discipline_records (player_id, tournament_id);

create index if not exists idx_users_username
  on public.users (username);

create index if not exists idx_users_email
  on public.users (email);

create index if not exists idx_users_created_at
  on public.users (created_at);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references public.users(id) on delete cascade,
  sender_name text not null,
  title text not null,
  body text not null,
  read boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.gallery_items (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  image_url text not null,
  category text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.sponsors (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  logo_url text,
  video_url text,
  address text,
  contact text,
  created_at timestamptz not null default now()
);

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  full_name text not null default '',
  username text not null unique default '',
  role public.role_type not null default 'Visitor',
  team_id uuid null references public.teams(id) on delete set null,
  team_manager_request boolean not null default false,
  permissions jsonb not null default '{
    "fikstur": false,
    "puanDurumu": false,
    "canliSkor": false,
    "disiplin": false,
    "takimOnaylari": false,
    "takimYonetimi": false,
    "galeri": false,
    "duyurular": false,
    "ayarlar": false
  }'::jsonb,
  avatar_url text,
  created_at timestamptz not null default now()
);

-- =========================================================
-- Indexes
-- =========================================================
create index if not exists idx_users_email on public.users(email);
create index if not exists idx_users_username on public.users(username);
create index if not exists idx_users_role on public.users(role);
create index if not exists idx_users_team_id on public.users(team_id);
create index if not exists idx_teams_manager on public.teams(manager_id);
create index if not exists idx_players_team on public.players(team_id);
create index if not exists idx_fixtures_tournament on public.fixtures(tournament_id);
create index if not exists idx_fixtures_teams on public.fixtures(home_team_id, away_team_id);
create index if not exists idx_matches_tournament on public.matches(tournament_id);
create index if not exists idx_matches_fixture on public.matches(fixture_id);
create index if not exists idx_match_events_match on public.match_events(match_id);
create index if not exists idx_match_events_team on public.match_events(team_id);
create index if not exists idx_match_statistics_match on public.match_statistics(match_id);
create index if not exists idx_match_statistics_player on public.match_statistics(player_id);
create index if not exists idx_match_statistics_tournament on public.match_statistics(tournament_id);
create index if not exists idx_player_match_stats_match on public.player_match_stats(match_id);
create index if not exists idx_player_match_stats_player on public.player_match_stats(player_id);
create index if not exists idx_player_match_stats_tournament on public.player_match_stats(tournament_id);
create index if not exists idx_discipline_player on public.discipline_records(player_id);
create index if not exists idx_messages_sender on public.messages(sender_id);
create index if not exists idx_messages_read on public.messages(read);
create index if not exists idx_profiles_username on public.profiles(username);
create index if not exists idx_profiles_team on public.profiles(team_id);
create index if not exists idx_sponsors_name on public.sponsors(name);

-- =========================================================
-- Automatic profile creation
-- =========================================================
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  insert into public.profiles (id, email, full_name, username, role, permissions)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)),
    coalesce(
      new.raw_user_meta_data ->> 'username',
      upper(replace(coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)), ' ', ''))
    ),
    'Visitor',
    '{"fikstur": false, "puanDurumu": false, "canliSkor": false, "disiplin": false, "takimOnaylari": false, "takimYonetimi": false, "galeri": false, "duyurular": false, "ayarlar": false}'::jsonb
  )
  on conflict (id) do update
  set email = excluded.email,
      full_name = coalesce(public.profiles.full_name, excluded.full_name),
      username = coalesce(public.profiles.username, excluded.username),
      role = coalesce(public.profiles.role, excluded.role);

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();

-- =========================================================
-- Row Level Security
-- =========================================================
alter table public.profiles enable row level security;
alter table public.teams enable row level security;
alter table public.tournaments enable row level security;
alter table public.fixtures enable row level security;
alter table public.sponsors enable row level security;
alter table public.match_statistics enable row level security;
alter table public.player_match_stats enable row level security;

create policy if not exists "profiles_select_public"
on public.profiles
for select
using (true);

create policy if not exists "profiles_insert_own"
on public.profiles
for insert
with check (auth.uid() = id);

create policy if not exists "profiles_update_own"
on public.profiles
for update
using (auth.uid() = id)
with check (auth.uid() = id);

create policy if not exists "profiles_delete_own"
on public.profiles
for delete
using (auth.uid() = id);

create policy if not exists "teams_select_public"
on public.teams
for select
using (true);

create policy if not exists "teams_manage_admin_or_manager"
on public.teams
for all
using (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.role in ('Super Admin', 'Admin', 'Team Manager')
  )
)
with check (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.role in ('Super Admin', 'Admin', 'Team Manager')
  )
);

create policy if not exists "tournaments_select_public"
on public.tournaments
for select
using (true);

create policy if not exists "tournaments_manage_admin"
on public.tournaments
for all
using (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.role in ('Super Admin', 'Admin')
  )
)
with check (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.role in ('Super Admin', 'Admin')
  )
);

create policy if not exists "fixtures_select_public"
on public.fixtures
for select
using (true);

create policy if not exists "fixtures_manage_admin_or_manager"
on public.fixtures
for all
using (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.role in ('Super Admin', 'Admin', 'Team Manager')
  )
)
with check (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.role in ('Super Admin', 'Admin', 'Team Manager')
  )
);

create policy if not exists "sponsors_select_public"
on public.sponsors
for select
using (true);

create policy if not exists "sponsors_manage_admin"
on public.sponsors
for all
using (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.role in ('Super Admin', 'Admin')
  )
)
with check (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.role in ('Super Admin', 'Admin')
  )
);

create policy if not exists "match_statistics_select_public"
on public.match_statistics
for select
using (true);

create policy if not exists "match_statistics_manage_admin"
on public.match_statistics
for all
using (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.role in ('Super Admin', 'Admin', 'Team Manager')
  )
)
with check (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.role in ('Super Admin', 'Admin', 'Team Manager')
  )
);

create policy if not exists "player_match_stats_select_public"
on public.player_match_stats
for select
using (true);

create policy if not exists "player_match_stats_manage_admin"
on public.player_match_stats
for all
using (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.role in ('Super Admin', 'Admin', 'Team Manager')
  )
)
with check (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.role in ('Super Admin', 'Admin', 'Team Manager')
  )
);

-- =========================================================
-- Seed data
-- =========================================================
insert into public.users (
  id,
  full_name,
  email,
  password,
  username,
  role,
  is_active,
  kvkk_accepted,
  phone,
  tc,
  team_id,
  team_manager_request,
  permissions
)
values (
  '0d5f2820-8d66-4b9d-96ee-cd5911f3e1d8',
  'EFRAİM YILMAZ',
  'sagliksk@gmail.com',
  'Efraim+08',
  'EFRAIMYILMAZ',
  'Super Admin',
  true,
  true,
  '+905551234567',
  '11111111111',
  null,
  false,
  '{
    "fikstur": true,
    "puanDurumu": true,
    "canliSkor": true,
    "disiplin": true,
    "takimOnaylari": true,
    "takimYonetimi": true,
    "galeri": true,
    "duyurular": true,
    "ayarlar": true
  }'::jsonb
)
on conflict (email) do nothing;

insert into public.teams (
  id,
  name,
  short_name,
  city,
  status,
  manager_id,
  logo_url
)
values
  (
    '1d0d1f7f-fd3d-4d48-b7a2-3da489d3bd9f',
    'Galatasaray',
    'GS',
    'İstanbul',
    'Onaylı',
    '0d5f2820-8d66-4b9d-96ee-cd5911f3e1d8',
    'https://upload.wikimedia.org/wikipedia/tr/4/4a/Galatasaray_Sports_Club_logo.png'
  ),
  (
    '4c6b9a3e-4df8-46ea-a3de-1c1dd0db0628',
    'Fenerbahçe',
    'FB',
    'İstanbul',
    'Onaylı',
    '0d5f2820-8d66-4b9d-96ee-cd5911f3e1d8',
    'https://upload.wikimedia.org/wikipedia/tr/8/87/Fenerbah%C3%A7e_SK_logo.png'
  )
on conflict (id) do nothing;

update public.users
set team_id = '1d0d1f7f-fd3d-4d48-b7a2-3da489d3bd9f'
where email = 'sagliksk@gmail.com';

insert into public.players (
  id,
  team_id,
  name,
  unit,
  phone,
  tc,
  photo_url,
  yellow_cards,
  red_cards,
  is_suspended,
  is_captain
)
values
  (
    '3d727955-ea68-4bde-8ca4-c7fd2f94b7f4',
    '1d0d1f7f-fd3d-4d48-b7a2-3da489d3bd9f',
    'Ali Yılmaz',
    'Futbolcu',
    '+905550000001',
    '10000000001',
    'https://example.com/ali.jpg',
    0,
    0,
    false,
    true
  ),
  (
    '8b0a70c7-514d-41a7-82a7-b97d4d3d3a44',
    '1d0d1f7f-fd3d-4d48-b7a2-3da489d3bd9f',
    'Kerem Demir',
    'Forvet',
    '+905550000002',
    '10000000002',
    null,
    1,
    0,
    false,
    false
  ),
  (
    'a9f4ea39-9594-4f39-a9e5-d911d12a145e',
    '4c6b9a3e-4df8-46ea-a3de-1c1dd0db0628',
    'Baran Korkmaz',
    'Kaleci',
    '+905550000011',
    '10000000011',
    'https://example.com/baran.jpg',
    0,
    0,
    false,
    true
  ),
  (
    'ab651caf-f570-436c-8b2a-0ea35f5e095a',
    '4c6b9a3e-4df8-46ea-a3de-1c1dd0db0628',
    'Mert Ozan',
    'Orta Saha',
    '+905550000012',
    '10000000012',
    null,
    0,
    0,
    false,
    false
  )
on conflict (id) do nothing;

insert into public.tournaments (
  id,
  name,
  status,
  start_date,
  scoring,
  yellow_card_rule,
  teams
)
values
  (
    'b1838b33-6db5-4347-9c6d-8a77ac02b2ee',
    'Sağlıkçılar Süper Lig',
    'Turnuva Başladı',
    '2026-09-02',
    '{"win": 3, "draw": 1, "loss": 0}'::jsonb,
    2,
    array['1d0d1f7f-fd3d-4d48-b7a2-3da489d3bd9f', '4c6b9a3e-4df8-46ea-a3de-1c1dd0db0628']
  ),
  (
    'd43d4f57-a2da-4310-bc0f-25206a0976b3',
    'Şehirlerarası Kupası',
    'Kayıt Açık',
    '2026-10-10',
    '{"win": 3, "draw": 1, "loss": 0}'::jsonb,
    2,
    array['1d0d1f7f-fd3d-4d48-b7a2-3da489d3bd9f', '4c6b9a3e-4df8-46ea-a3de-1c1dd0db0628']
  )
on conflict (id) do nothing;

insert into public.fixtures (
  id,
  tournament_id,
  home_team_id,
  away_team_id,
  fixture_date,
  fixture_time,
  venue,
  status,
  home_score,
  away_score,
  notes
)
values
  (
    '0e6010b1-c76b-4f93-b119-5d3d318af850',
    'b1838b33-6db5-4347-9c6d-8a77ac02b2ee',
    '1d0d1f7f-fd3d-4d48-b7a2-3da489d3bd9f',
    '4c6b9a3e-4df8-46ea-a3de-1c1dd0db0628',
    '2026-09-02',
    '20:00',
    'Spor Kompleksi',
    'Planlandı',
    0,
    0,
    'İlk lig maçı'
  ),
  (
    '5022ff15-df49-409e-88d5-f6a6d9cc7d4a',
    'd43d4f57-a2da-4310-bc0f-25206a0976b3',
    '4c6b9a3e-4df8-46ea-a3de-1c1dd0db0628',
    '1d0d1f7f-fd3d-4d48-b7a2-3da489d3bd9f',
    '2026-10-10',
    '19:30',
    'Merkez Stadyum',
    'Planlandı',
    0,
    0,
    'Kupa ilk tur'
  )
on conflict (id) do nothing;

insert into public.matches (
  id,
  tournament_id,
  fixture_id,
  home_team_id,
  away_team_id,
  home_score,
  away_score,
  status,
  mvp_player_id
)
values (
  '22e1cdb9-35c3-46ed-9f4c-f0dd23e9ff88',
  'b1838b33-6db5-4347-9c6d-8a77ac02b2ee',
  '0e6010b1-c76b-4f93-b119-5d3d318af850',
  '1d0d1f7f-fd3d-4d48-b7a2-3da489d3bd9f',
  '4c6b9a3e-4df8-46ea-a3de-1c1dd0db0628',
  0,
  0,
  'Başlatıldı',
  null
)
on conflict (id) do nothing;

insert into public.match_events (
  id,
  match_id,
  type,
  minute,
  team_id,
  player_id,
  description
)
values (
  'bd721dd9-34c0-4d05-b471-9b8d99b1280b',
  '22e1cdb9-35c3-46ed-9f4c-f0dd23e9ff88',
  'goal',
  12,
  '1d0d1f7f-fd3d-4d48-b7a2-3da489d3bd9f',
  '3d727955-ea68-4bde-8ca4-c7fd2f94b7f4',
  'Ali Yılmaz gol attı'
),
(
  'e0ad4d3a-e5e8-43e4-8c29-8b4547c83ab1',
  '22e1cdb9-35c3-46ed-9f4c-f0dd23e9ff88',
  'yellow',
  35,
  '4c6b9a3e-4df8-46ea-a3de-1c1dd0db0628',
  'a9f4ea39-9594-4f39-a9e5-d911d12a145e',
  'Baran Korkmaz kart gördü'
)
on conflict (id) do nothing;

insert into public.discipline_records (
  id,
  player_id,
  tournament_id,
  yellow_cards,
  red_cards,
  suspension_matches,
  reason
)
values (
  '1151d01d-27d7-4e52-b52d-267a822d21db',
  '8b0a70c7-514d-41a7-82a7-b97d4d3d3a44',
  'b1838b33-6db5-4347-9c6d-8a77ac02b2ee',
  1,
  0,
  0,
  'Sarı kart uyarısı'
)
on conflict (id) do nothing;

insert into public.messages (
  id,
  sender_id,
  sender_name,
  title,
  body,
  read
)
values (
  'd2f2a4a0-c116-472c-9597-47549f4d9c6e',
  '0d5f2820-8d66-4b9d-96ee-cd5911f3e1d8',
  'EFRAİM YILMAZ',
  'Turnuva bildirimi',
  'Haftalık turnuva duyurusu hazırlandı.',
  false
);

-- =========================================================
-- Demo seed for roles, teams and players
-- =========================================================
insert into auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_user_meta_data,
  created_at,
  updated_at
)
values
  (
    '00000000-0000-0000-0000-000000000000',
    'fa4d4e82-41ab-4c8e-9d66-7b3a4d17d3a2',
    'authenticated',
    'authenticated',
    'sagliksk@gmail.com',
    crypt('Efraim+08', gen_salt('bf')),
    now(),
    '{"full_name":"Efraim Yılmaz","username":"EFRAIMYILMAZ"}'::jsonb,
    now(),
    now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '7d8fe4f0-4e7d-4fa9-8a8d-7a1d8d0f5918',
    'authenticated',
    'authenticated',
    'admin@leaguehub.com',
    crypt('admin123', gen_salt('bf')),
    now(),
    '{"full_name":"Merve Demir","username":"MERVEDemir"}'::jsonb,
    now(),
    now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '1156d5d3-b169-42a2-98bb-5d3cd96f77c2',
    'authenticated',
    'authenticated',
    'saglik.manager@leaguehub.com',
    crypt('team123', gen_salt('bf')),
    now(),
    '{"full_name":"Ali Kaya","username":"ALIKAYA"}'::jsonb,
    now(),
    now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '9ba6d596-2fd7-4c76-b385-64d1df3b4fd3',
    'authenticated',
    'authenticated',
    'mediterra.manager@leaguehub.com',
    crypt('team123', gen_salt('bf')),
    now(),
    '{"full_name":"Bora Aydın","username":"BORAAYDIN"}'::jsonb,
    now(),
    now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    'd4f65d95-2d58-4d14-ab90-c8ad4a1189c8',
    'authenticated',
    'authenticated',
    'asist.manager@leaguehub.com',
    crypt('team123', gen_salt('bf')),
    now(),
    '{"full_name":"Cem Reşit","username":"CEMRESIT"}'::jsonb,
    now(),
    now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '6f2222f5-0761-4d44-a30c-b037dd5d2d39',
    'authenticated',
    'authenticated',
    'imed.manager@leaguehub.com',
    crypt('team123', gen_salt('bf')),
    now(),
    '{"full_name":"Deniz Koral","username":"DENIZKORAL"}'::jsonb,
    now(),
    now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '4d87e0dc-09df-47cf-b9ec-431f76caef55',
    'authenticated',
    'authenticated',
    'visitor@leaguehub.com',
    crypt('visitor123', gen_salt('bf')),
    now(),
    '{"full_name":"Nur Şahin","username":"NURSahin"}'::jsonb,
    now(),
    now()
  )
on conflict (id) do nothing;

insert into public.users (
  id,
  full_name,
  email,
  password,
  username,
  role,
  is_active,
  kvkk_accepted,
  phone,
  tc,
  team_id,
  team_manager_request,
  permissions,
  created_at
)
values
  (
    'fa4d4e82-41ab-4c8e-9d66-7b3a4d17d3a2',
    'Efraim Yılmaz',
    'sagliksk@gmail.com',
    'Efraim+08',
    'EFRAIMYILMAZ',
    'Super Admin',
    true,
    true,
    '+905551234567',
    '11111111111',
    null,
    false,
    '{"fikstur": true, "puanDurumu": true, "canliSkor": true, "disiplin": true, "takimOnaylari": true, "takimYonetimi": true, "galeri": true, "duyurular": true, "ayarlar": true}'::jsonb,
    now()
  ),
  (
    '7d8fe4f0-4e7d-4fa9-8a8d-7a1d8d0f5918',
    'Merve Demir',
    'admin@leaguehub.com',
    'admin123',
    'MERVEDemir',
    'Admin',
    true,
    true,
    '+905556667788',
    '22222222222',
    null,
    false,
    '{"fikstur": true, "puanDurumu": true, "canliSkor": true, "disiplin": true, "takimOnaylari": true, "takimYonetimi": false, "galeri": true, "duyurular": true, "ayarlar": true}'::jsonb,
    now()
  ),
  (
    '1156d5d3-b169-42a2-98bb-5d3cd96f77c2',
    'Ali Kaya',
    'saglik.manager@leaguehub.com',
    'team123',
    'ALIKAYA',
    'Team Manager',
    true,
    true,
    '+905559998877',
    '33333333333',
    '6f36df94-658a-4ec1-92e3-88442c4b4d34',
    false,
    '{"fikstur": false, "puanDurumu": true, "canliSkor": true, "disiplin": true, "takimOnaylari": false, "takimYonetimi": true, "galeri": false, "duyurular": true, "ayarlar": false}'::jsonb,
    now()
  ),
  (
    '9ba6d596-2fd7-4c76-b385-64d1df3b4fd3',
    'Bora Aydın',
    'mediterra.manager@leaguehub.com',
    'team123',
    'BORAAYDIN',
    'Team Manager',
    true,
    true,
    '+905554443322',
    '44444444444',
    'af4140d4-b960-4eaf-b63f-c7f9bc7d2d28',
    false,
    '{"fikstur": false, "puanDurumu": true, "canliSkor": true, "disiplin": true, "takimOnaylari": false, "takimYonetimi": true, "galeri": false, "duyurular": true, "ayarlar": false}'::jsonb,
    now()
  ),
  (
    'd4f65d95-2d58-4d14-ab90-c8ad4a1189c8',
    'Cem Reşit',
    'asist.manager@leaguehub.com',
    'team123',
    'CEMRESIT',
    'Team Manager',
    true,
    true,
    '+905553332211',
    '55555555555',
    'cf3a0796-3bbd-4284-8f33-9e1efe4cc3d7',
    false,
    '{"fikstur": false, "puanDurumu": true, "canliSkor": true, "disiplin": true, "takimOnaylari": false, "takimYonetimi": true, "galeri": false, "duyurular": true, "ayarlar": false}'::jsonb,
    now()
  ),
  (
    '6f2222f5-0761-4d44-a30c-b037dd5d2d39',
    'Deniz Koral',
    'imed.manager@leaguehub.com',
    'team123',
    'DENIZKORAL',
    'Team Manager',
    true,
    true,
    '+905552221100',
    '66666666666',
    'deb7f523-8d53-47db-9ec7-fd074f0bc0e5',
    false,
    '{"fikstur": false, "puanDurumu": true, "canliSkor": true, "disiplin": true, "takimOnaylari": false, "takimYonetimi": true, "galeri": false, "duyurular": true, "ayarlar": false}'::jsonb,
    now()
  ),
  (
    '4d87e0dc-09df-47cf-b9ec-431f76caef55',
    'Nur Şahin',
    'visitor@leaguehub.com',
    'visitor123',
    'NURSahin',
    'Visitor',
    true,
    true,
    '+905554445566',
    '77777777777',
    null,
    true,
    '{"fikstur": false, "puanDurumu": false, "canliSkor": false, "disiplin": false, "takimOnaylari": false, "takimYonetimi": false, "galeri": false, "duyurular": false, "ayarlar": false}'::jsonb,
    now()
  )
on conflict (email) do update set
  full_name = excluded.full_name,
  username = excluded.username,
  role = excluded.role,
  team_id = excluded.team_id,
  team_manager_request = excluded.team_manager_request,
  permissions = excluded.permissions;

insert into public.profiles (
  id,
  email,
  full_name,
  username,
  role,
  team_id,
  team_manager_request,
  permissions,
  created_at
)
values
  ('fa4d4e82-41ab-4c8e-9d66-7b3a4d17d3a2', 'sagliksk@gmail.com', 'Efraim Yılmaz', 'EFRAIMYILMAZ', 'Super Admin', null, false, '{"fikstur": true, "puanDurumu": true, "canliSkor": true, "disiplin": true, "takimOnaylari": true, "takimYonetimi": true, "galeri": true, "duyurular": true, "ayarlar": true}'::jsonb, now()),
  ('7d8fe4f0-4e7d-4fa9-8a8d-7a1d8d0f5918', 'admin@leaguehub.com', 'Merve Demir', 'MERVEDemir', 'Admin', null, false, '{"fikstur": true, "puanDurumu": true, "canliSkor": true, "disiplin": true, "takimOnaylari": true, "takimYonetimi": false, "galeri": true, "duyurular": true, "ayarlar": true}'::jsonb, now()),
  ('1156d5d3-b169-42a2-98bb-5d3cd96f77c2', 'saglik.manager@leaguehub.com', 'Ali Kaya', 'ALIKAYA', 'Team Manager', '6f36df94-658a-4ec1-92e3-88442c4b4d34', false, '{"fikstur": false, "puanDurumu": true, "canliSkor": true, "disiplin": true, "takimOnaylari": false, "takimYonetimi": true, "galeri": false, "duyurular": true, "ayarlar": false}'::jsonb, now()),
  ('9ba6d596-2fd7-4c76-b385-64d1df3b4fd3', 'mediterra.manager@leaguehub.com', 'Bora Aydın', 'BORAAYDIN', 'Team Manager', 'af4140d4-b960-4eaf-b63f-c7f9bc7d2d28', false, '{"fikstur": false, "puanDurumu": true, "canliSkor": true, "disiplin": true, "takimOnaylari": false, "takimYonetimi": true, "galeri": false, "duyurular": true, "ayarlar": false}'::jsonb, now()),
  ('d4f65d95-2d58-4d14-ab90-c8ad4a1189c8', 'asist.manager@leaguehub.com', 'Cem Reşit', 'CEMRESIT', 'Team Manager', 'cf3a0796-3bbd-4284-8f33-9e1efe4cc3d7', false, '{"fikstur": false, "puanDurumu": true, "canliSkor": true, "disiplin": true, "takimOnaylari": false, "takimYonetimi": true, "galeri": false, "duyurular": true, "ayarlar": false}'::jsonb, now()),
  ('6f2222f5-0761-4d44-a30c-b037dd5d2d39', 'imed.manager@leaguehub.com', 'Deniz Koral', 'DENIZKORAL', 'Team Manager', 'deb7f523-8d53-47db-9ec7-fd074f0bc0e5', false, '{"fikstur": false, "puanDurumu": true, "canliSkor": true, "disiplin": true, "takimOnaylari": false, "takimYonetimi": true, "galeri": false, "duyurular": true, "ayarlar": false}'::jsonb, now()),
  ('4d87e0dc-09df-47cf-b9ec-431f76caef55', 'visitor@leaguehub.com', 'Nur Şahin', 'NURSahin', 'Visitor', null, true, '{"fikstur": false, "puanDurumu": false, "canliSkor": false, "disiplin": false, "takimOnaylari": false, "takimYonetimi": false, "galeri": false, "duyurular": false, "ayarlar": false}'::jsonb, now())
on conflict (id) do update set
  email = excluded.email,
  full_name = excluded.full_name,
  username = excluded.username,
  role = excluded.role,
  team_id = excluded.team_id,
  team_manager_request = excluded.team_manager_request,
  permissions = excluded.permissions;

insert into public.teams (
  id,
  name,
  short_name,
  city,
  status,
  manager_id,
  logo_url,
  created_at
)
values
  ('6f36df94-658a-4ec1-92e3-88442c4b4d34', 'Sağlık SK', 'SK', 'İstanbul', 'Onaylı', '1156d5d3-b169-42a2-98bb-5d3cd96f77c2', 'https://images.unsplash.com/photo-1517649763962-0c623066013b?auto=format&fit=crop&w=300&q=80', now()),
  ('af4140d4-b960-4eaf-b63f-c7f9bc7d2d28', 'Mediterra', 'MED', 'Antalya', 'Onaylı', '9ba6d596-2fd7-4c76-b385-64d1df3b4fd3', 'https://images.unsplash.com/photo-1547347298-4074fc3086f0?auto=format&fit=crop&w=300&q=80', now()),
  ('cf3a0796-3bbd-4284-8f33-9e1efe4cc3d7', 'Asist FK', 'ASİ', 'Ankara', 'Onaylı', 'd4f65d95-2d58-4d14-ab90-c8ad4a1189c8', 'https://images.unsplash.com/photo-1521412644187-c49fa049e84d?auto=format&fit=crop&w=300&q=80', now()),
  ('deb7f523-8d53-47db-9ec7-fd074f0bc0e5', 'İmed FC', 'İMED', 'İzmir', 'Onaylı', '6f2222f5-0761-4d44-a30c-b037dd5d2d39', 'https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?auto=format&fit=crop&w=300&q=80', now())
on conflict (id) do update set
  name = excluded.name,
  short_name = excluded.short_name,
  city = excluded.city,
  status = excluded.status,
  manager_id = excluded.manager_id,
  logo_url = excluded.logo_url;

insert into public.players (
  id,
  team_id,
  name,
  unit,
  phone,
  tc,
  photo_url,
  yellow_cards,
  red_cards,
  is_suspended,
  is_captain,
  created_at
)
values
  ('3d727955-ea68-4bde-8ca4-c7fd2f94b7f4', '6f36df94-658a-4ec1-92e3-88442c4b4d34', 'Ali Yılmaz', 'Futbolcu', '+905550000001', '10000000001', 'https://example.com/ali.jpg', 0, 0, false, true, now()),
  ('8b0a70c7-514d-41a7-82a7-b97d4d3d3a44', '6f36df94-658a-4ec1-92e3-88442c4b4d34', 'Kerem Demir', 'Forvet', '+905550000002', '10000000002', null, 1, 0, false, false, now()),
  ('a9f4ea39-9594-4f39-a9e5-d911d12a145e', '6f36df94-658a-4ec1-92e3-88442c4b4d34', 'Emre Çelik', 'Defans', '+905550000003', '10000000003', null, 0, 0, false, false, now()),
  ('b8a8ed0e-92a1-4773-b6f2-ee19f56f2b4f', '6f36df94-658a-4ec1-92e3-88442c4b4d34', 'Musa Şen', 'Orta Saha', '+905550000004', '10000000004', null, 0, 0, false, false, now()),
  ('8248eb06-c7d6-412d-9d32-5d6509a9d3de', '6f36df94-658a-4ec1-92e3-88442c4b4d34', 'Ömer Koca', 'Kaleci', '+905550000005', '10000000005', null, 0, 0, false, false, now()),
  ('b0a7ec49-c246-4def-af4f-d7df1530f255', 'af4140d4-b960-4eaf-b63f-c7f9bc7d2d28', 'Baran Korkmaz', 'Kaleci', '+905550000011', '10000000011', 'https://example.com/baran.jpg', 0, 0, false, true, now()),
  ('8d12a6dc-f06d-499d-8b2d-a44bf4d0d7ad', 'af4140d4-b960-4eaf-b63f-c7f9bc7d2d28', 'Mert Ozan', 'Orta Saha', '+905550000012', '10000000012', null, 0, 0, false, false, now()),
  ('59cf8f34-6920-45f4-b1c0-3ebd9e6be187', 'af4140d4-b960-4eaf-b63f-c7f9bc7d2d28', 'Serhat Aydin', 'Kanat', '+905550000013', '10000000013', null, 0, 0, false, false, now()),
  ('3f870e4a-3252-4614-8d3a-44b9d6dca4df', 'af4140d4-b960-4eaf-b63f-c7f9bc7d2d28', 'Tayfun Erol', 'Defans', '+905550000014', '10000000014', null, 0, 0, false, false, now()),
  ('5fcaa1bb-67f3-4afc-9802-e16ef1e33110', 'af4140d4-b960-4eaf-b63f-c7f9bc7d2d28', 'Kaan Düz', 'Forvet', '+905550000015', '10000000015', null, 0, 0, false, false, now()),
  ('f2f4224b-d6fb-4f78-8d52-4d7d4a4bfe4d', 'cf3a0796-3bbd-4284-8f33-9e1efe4cc3d7', 'Cenk Arslan', 'Forvet', '+905550000021', '10000000021', null, 0, 0, false, true, now()),
  ('7909ca7a-cb58-43ee-b7d1-1d1c998b066c', 'cf3a0796-3bbd-4284-8f33-9e1efe4cc3d7', 'Yusuf Kaplan', 'Orta Saha', '+905550000022', '10000000022', null, 0, 0, false, false, now()),
  ('1bb882f2-cc5d-47b8-84e2-26a6f05bb7d2', 'cf3a0796-3bbd-4284-8f33-9e1efe4cc3d7', 'Mehmet Taş', 'Defans', '+905550000023', '10000000023', null, 0, 0, false, false, now()),
  ('2b8a654d-8d7b-4bd1-9f9e-fb48474c0b5b', 'cf3a0796-3bbd-4284-8f33-9e1efe4cc3d7', 'İsmail Kılıç', 'Kanat', '+905550000024', '10000000024', null, 0, 0, false, false, now()),
  ('1a8ef9b7-5d8e-4334-85d9-054b1d5a472d', 'cf3a0796-3bbd-4284-8f33-9e1efe4cc3d7', 'Doğan Yalçın', 'Kaleci', '+905550000025', '10000000025', null, 0, 0, false, false, now()),
  ('d40781ea-0d5b-466e-ab7c-3d8af9a26206', 'deb7f523-8d53-47db-9ec7-fd074f0bc0e5', 'Levent Şimşek', 'Kanat', '+905550000031', '10000000031', null, 0, 0, false, true, now()),
  ('1e750d51-7a8e-4ee1-8d57-3d9467f0e747', 'deb7f523-8d53-47db-9ec7-fd074f0bc0e5', 'Rıza Bulut', 'Defans', '+905550000032', '10000000032', null, 0, 0, false, false, now()),
  ('7ab2de53-f16c-41f8-9104-77dd86d65fd7', 'deb7f523-8d53-47db-9ec7-fd074f0bc0e5', 'Eren Topal', 'Orta Saha', '+905550000033', '10000000033', null, 0, 0, false, false, now()),
  ('d3160424-fc2b-45f5-a0b1-32d66a21cbce', 'deb7f523-8d53-47db-9ec7-fd074f0bc0e5', 'Gökalp Uçar', 'Forvet', '+905550000034', '10000000034', null, 0, 0, false, false, now()),
  ('b8b8c0b7-c8da-427d-9a47-c9a3cf8b4293', 'deb7f523-8d53-47db-9ec7-fd074f0bc0e5', 'Volkan Kıran', 'Kaleci', '+905550000035', '10000000035', null, 0, 0, false, false, now())
on conflict (id) do update set
  team_id = excluded.team_id,
  name = excluded.name,
  unit = excluded.unit,
  phone = excluded.phone,
  tc = excluded.tc,
  photo_url = excluded.photo_url,
  yellow_cards = excluded.yellow_cards,
  red_cards = excluded.red_cards,
  is_suspended = excluded.is_suspended,
  is_captain = excluded.is_captain;
on conflict (id) do nothing;

insert into public.announcements (
  id,
  title,
  body
)
values
  (
    'f6d47401-3d8a-4a3d-a5db-4c53553d42ef',
    'Açık Kayıt Dönemi',
    'Yeni turnuva kaydı açılmıştır.'
  ),
  (
    'ea3bb57d-b840-4a96-a44d-5369ccc7b124',
    'Canlı Yayın',
    'Perşembe akşamı canlı yayın başlıyor.'
  )
on conflict (id) do nothing;

insert into public.gallery_items (
  id,
  title,
  image_url,
  category
)
values (
  'e5a41343-9d17-4ce0-b7d6-bcb936fdbb39',
  'Kupa Töreni',
  'https://images.unsplash.com/photo-1547347298-4074fc3086f0',
  'Turnuva'
)
on conflict (id) do nothing;

-- =========================================================
-- RLS setup
-- =========================================================
alter table public.users enable row level security;
alter table public.teams enable row level security;
alter table public.players enable row level security;
alter table public.tournaments enable row level security;
alter table public.fixtures enable row level security;
alter table public.matches enable row level security;
alter table public.match_events enable row level security;
alter table public.discipline_records enable row level security;
alter table public.messages enable row level security;
alter table public.announcements enable row level security;
alter table public.gallery_items enable row level security;

-- Demo-friendly rules: read is public, writes are allowed for authenticated sessions.
-- For a stricter production setup, replace these with auth.uid() based checks.

drop policy if exists "users_select_public" on public.users;
drop policy if exists "users_all_authenticated" on public.users;
create policy "users_select_public" on public.users for select using (true);
create policy "users_all_authenticated" on public.users for all using (true) with check (true);

drop policy if exists "teams_select_public" on public.teams;
drop policy if exists "teams_all_authenticated" on public.teams;
create policy "teams_select_public" on public.teams for select using (true);
create policy "teams_all_authenticated" on public.teams
for all
using (true)
with check (
  exists (
    select 1
    from public.users u
    where u.id = auth.uid()
      and u.role in ('Admin', 'Super Admin')
  )
  or (
    auth.uid() = public.teams.manager_id
    and public.teams.status in ('Beklemede', 'Reddedildi')
  )
);

drop policy if exists "players_select_public" on public.players;
drop policy if exists "players_all_authenticated" on public.players;
create policy "players_select_public" on public.players for select using (true);
create policy "players_all_authenticated" on public.players for all using (true) with check (true);

drop policy if exists "tournaments_select_public" on public.tournaments;
drop policy if exists "tournaments_all_authenticated" on public.tournaments;
create policy "tournaments_select_public" on public.tournaments for select using (true);
create policy "tournaments_all_authenticated" on public.tournaments for all using (true) with check (true);

drop policy if exists "fixtures_select_public" on public.fixtures;
drop policy if exists "fixtures_all_authenticated" on public.fixtures;
create policy "fixtures_select_public" on public.fixtures for select using (true);
create policy "fixtures_all_authenticated" on public.fixtures for all using (true) with check (true);

drop policy if exists "matches_select_public" on public.matches;
drop policy if exists "matches_all_authenticated" on public.matches;
create policy "matches_select_public" on public.matches for select using (true);
create policy "matches_all_authenticated" on public.matches for all using (true) with check (true);

drop policy if exists "match_events_select_public" on public.match_events;
drop policy if exists "match_events_all_authenticated" on public.match_events;
create policy "match_events_select_public" on public.match_events for select using (true);
create policy "match_events_all_authenticated" on public.match_events for all using (true) with check (true);

drop policy if exists "discipline_select_public" on public.discipline_records;
drop policy if exists "discipline_all_authenticated" on public.discipline_records;
create policy "discipline_select_public" on public.discipline_records for select using (true);
create policy "discipline_all_authenticated" on public.discipline_records for all using (true) with check (true);

drop policy if exists "messages_select_public" on public.messages;
drop policy if exists "messages_all_authenticated" on public.messages;
create policy "messages_select_public" on public.messages for select using (true);
create policy "messages_all_authenticated" on public.messages for all using (true) with check (true);

drop policy if exists "announcements_select_public" on public.announcements;
drop policy if exists "announcements_all_authenticated" on public.announcements;
create policy "announcements_select_public" on public.announcements for select using (true);
create policy "announcements_all_authenticated" on public.announcements for all using (true) with check (true);

drop policy if exists "gallery_select_public" on public.gallery_items;
drop policy if exists "gallery_all_authenticated" on public.gallery_items;
create policy "gallery_select_public" on public.gallery_items for select using (true);
create policy "gallery_all_authenticated" on public.gallery_items for all using (true) with check (true);

-- =========================================================
-- Verification helpers
-- =========================================================
select 'LeagueHub schema ready' as status;
