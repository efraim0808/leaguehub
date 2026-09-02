-- Ensure core identity linkage exists for users and team-based player records.
-- This prevents: "Could not find the 'team_id' column of 'users'"
-- and the common players -> tournament reference mismatch.

alter table if exists public.users
  add column if not exists team_id uuid null;

create index if not exists idx_users_team_id
  on public.users(team_id);

alter table public.users
  drop constraint if exists users_team_fk;

alter table public.users
  add constraint if not exists users_team_fk
  foreign key (team_id) references public.teams(id) on delete set null;

create table if not exists public.players (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  tournament_id uuid null references public.tournaments(id) on delete set null,
  name text not null,
  unit text not null,
  phone text not null,
  tc text not null,
  photo_url text,
  position text,
  yellow_cards integer not null default 0,
  red_cards integer not null default 0,
  is_suspended boolean not null default false,
  is_captain boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists idx_players_team_id
  on public.players(team_id);

create index if not exists idx_players_tournament_id
  on public.players(tournament_id);

alter table public.players
  add column if not exists tournament_id uuid null;

update public.players p
set tournament_id = (
  select t.id
  from public.teams team
  join public.tournaments t on t.id = team.tournament_id
  where team.id = p.team_id
  limit 1
)
where p.tournament_id is null
  and exists (
    select 1
    from public.teams team
    join public.tournaments t on t.id = team.tournament_id
    where team.id = p.team_id
  );

alter table public.players
  drop constraint if exists players_tournament_fk;

alter table public.players
  add constraint if not exists players_tournament_fk
  foreign key (tournament_id) references public.tournaments(id) on delete set null;

alter table if exists public.matches
  add column if not exists week text,
  add column if not exists match_date date,
  add column if not exists match_time time,
  add column if not exists venue text,
  add column if not exists elapsed_minutes integer not null default 0;

create index if not exists idx_matches_week
  on public.matches(week);

create index if not exists idx_matches_match_date
  on public.matches(match_date);

-- Optional: ensure RLS allows admin-level updates if your DB has strict policies.
-- If you use the project schema, this is already covered by the broad authenticated policy.
