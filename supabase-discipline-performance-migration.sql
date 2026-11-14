alter table public.players
  add column if not exists yellow_cards integer not null default 0,
  add column if not exists red_cards integer not null default 0,
  add column if not exists is_suspended boolean not null default false;

alter table public.discipline_records
  add column if not exists yellow_cards integer not null default 0,
  add column if not exists red_cards integer not null default 0,
  add column if not exists suspension_matches integer not null default 0;

alter table public.match_statistics
  add column if not exists assists integer not null default 0;

alter table public.player_match_stats
  add column if not exists assists integer not null default 0;

alter table public.tournaments
  alter column yellow_card_rule set default 3;

alter table public.matches
  add column if not exists elapsed_seconds integer not null default 0,
  add column if not exists current_minute integer not null default 0,
  add column if not exists started_at timestamptz null;
