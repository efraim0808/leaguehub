-- Preview likely duplicate players before cleanup:
-- select
--   team_id,
--   lower(regexp_replace(
--     translate(name, 'ÜüİıÖöÇçĞğŞş', 'UuIiOoCcGgSs'),
--     '[[:space:]]+',
--     ' ',
--     'g'
--   )) as normalized_name,
--   count(*) as duplicate_count,
--   array_agg(id order by created_at asc nulls last, id::text asc) as player_ids
-- from public.players
-- where btrim(name) <> ''
-- group by team_id, lower(regexp_replace(
--   translate(name, 'ÜüİıÖöÇçĞğŞş', 'UuIiOoCcGgSs'),
--   '[[:space:]]+',
--   ' ',
--   'g'
-- ))
-- having count(*) > 1;

begin;

create temporary table player_duplicate_map on commit drop as
with ranked_players as (
  select
    id,
    first_value(id) over (
      partition by team_id, lower(regexp_replace(
        translate(name, 'ÜüİıÖöÇçĞğŞş', 'UuIiOoCcGgSs'),
        '[[:space:]]+',
        ' ',
        'g'
      ))
      order by created_at asc nulls last, id::text asc
    ) as keeper_id,
    row_number() over (
      partition by team_id, lower(regexp_replace(
        translate(name, 'ÜüİıÖöÇçĞğŞş', 'UuIiOoCcGgSs'),
        '[[:space:]]+',
        ' ',
        'g'
      ))
      order by created_at asc nulls last, id::text asc
    ) as duplicate_rank
  from public.players
  where btrim(name) <> ''
)
select id as duplicate_id, keeper_id
from ranked_players
where duplicate_rank > 1;

-- Repoint dependent records before deleting duplicate player rows.
update public.match_events events
set player_id = duplicates.keeper_id
from player_duplicate_map duplicates
where events.player_id = duplicates.duplicate_id;

update public.match_statistics stats
set player_id = duplicates.keeper_id
from player_duplicate_map duplicates
where stats.player_id = duplicates.duplicate_id;

update public.player_match_stats stats
set player_id = duplicates.keeper_id
from player_duplicate_map duplicates
where stats.player_id = duplicates.duplicate_id;

update public.discipline_records records
set player_id = duplicates.keeper_id
from player_duplicate_map duplicates
where records.player_id = duplicates.duplicate_id;

update public.matches matches
set mvp_player_id = duplicates.keeper_id
from player_duplicate_map duplicates
where matches.mvp_player_id = duplicates.duplicate_id;

delete from public.players players
using player_duplicate_map duplicates
where players.id = duplicates.duplicate_id;

commit;
