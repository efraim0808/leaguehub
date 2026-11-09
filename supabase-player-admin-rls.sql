-- Limit player roster writes to admins, while preserving team-manager inserts.
-- Admins include both the Super Admin and Admin application roles.

alter table public.users enable row level security;
alter table public.players enable row level security;

create or replace function public.enforce_user_role_admin()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  caller_is_admin boolean;
begin
  -- Direct SQL and service-role operations are trusted provisioning paths.
  if auth.role() is null or auth.role() = 'service_role' then
    return new;
  end if;

  select exists (
    select 1
    from public.users u
    where u.id = auth.uid()
      and lower(btrim(u.role::text)) in ('admin', 'super admin', 'süper admin', 'yönetici', 'yonetici')
  )
  into caller_is_admin;

  if tg_op = 'INSERT' then
    if lower(btrim(new.role::text)) in ('admin', 'super admin', 'süper admin', 'yönetici', 'yonetici')
       and not caller_is_admin then
      raise exception 'Only an admin can assign an admin role.'
        using errcode = '42501';
    end if;
  elsif new.role is distinct from old.role and not caller_is_admin then
    raise exception 'Only an admin can change a user role.'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_user_role_admin on public.users;
create trigger enforce_user_role_admin
before insert or update on public.users
for each row
execute function public.enforce_user_role_admin();

drop policy if exists "players_all_authenticated" on public.players;
drop policy if exists "players_select_public" on public.players;
drop policy if exists "players_admin_insert_or_manager_insert" on public.players;
drop policy if exists "players_admin_update" on public.players;
drop policy if exists "players_admin_delete" on public.players;

create policy "players_select_public"
on public.players
for select
using (true);

create policy "players_admin_insert_or_manager_insert"
on public.players
for insert
to authenticated
with check (
  exists (
    select 1
    from public.users u
    where u.id = auth.uid()
      and lower(btrim(u.role::text)) in ('admin', 'super admin', 'süper admin', 'yönetici', 'yonetici')
  )
  or exists (
    select 1
    from public.users u
    join public.teams t on t.id = public.players.team_id
    where u.id = auth.uid()
      and lower(btrim(u.role::text)) = 'team manager'
      and t.manager_id = auth.uid()
  )
);

create policy "players_admin_update"
on public.players
for update
to authenticated
using (
  exists (
    select 1
    from public.users u
    where u.id = auth.uid()
      and lower(btrim(u.role::text)) in ('admin', 'super admin', 'süper admin', 'yönetici', 'yonetici')
  )
)
with check (
  exists (
    select 1
    from public.users u
    where u.id = auth.uid()
      and lower(btrim(u.role::text)) in ('admin', 'super admin', 'süper admin', 'yönetici', 'yonetici')
  )
);

create policy "players_admin_delete"
on public.players
for delete
to authenticated
using (
  exists (
    select 1
    from public.users u
    where u.id = auth.uid()
      and lower(btrim(u.role::text)) in ('admin', 'super admin', 'süper admin', 'yönetici', 'yonetici')
  )
);
