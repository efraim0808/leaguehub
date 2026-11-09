-- Limit player roster writes to admins, while preserving team-manager inserts.
-- Admins include both the Super Admin and Admin application roles.

alter type public.role_type add value if not exists 'SUPER_ADMIN';
alter type public.role_type add value if not exists 'super_admin';

alter table public.users enable row level security;
alter table public.players enable row level security;

create or replace function public.normalize_role_key(role_name text)
returns text
language sql
immutable
set search_path = pg_catalog
as $$
  select trim(both '_' from regexp_replace(
    translate(lower(btrim(coalesce(role_name, ''))), 'üıöçğş', 'uiocgs'),
    '[[:space:]_-]+',
    '_',
    'g'
  ));
$$;

create or replace function public.is_admin_role(role_name text)
returns boolean
language sql
immutable
set search_path = public, pg_catalog
as $$
  select public.normalize_role_key(role_name) in (
    'admin',
    'super_admin',
    'superadmin',
    'yonetici'
  );
$$;

create or replace function public.is_current_user_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.users u
    where u.id = auth.uid()
      and public.is_admin_role(u.role::text)
  );
$$;

update public.users
set role = 'Super Admin'
where public.normalize_role_key(role::text) in ('super_admin', 'superadmin')
  and role::text <> 'Super Admin';

update public.profiles
set role = 'Super Admin'
where public.normalize_role_key(role::text) in ('super_admin', 'superadmin')
  and role::text <> 'Super Admin';

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

  caller_is_admin := public.is_current_user_admin();

  if tg_op = 'INSERT' then
    if public.is_admin_role(new.role::text) and not caller_is_admin then
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
  public.is_current_user_admin()
  or exists (
    select 1
    from public.users u
    join public.teams t on t.id = public.players.team_id
    where u.id = auth.uid()
      and public.normalize_role_key(u.role::text) = 'team_manager'
      and t.manager_id = auth.uid()
  )
);

create policy "players_admin_update"
on public.players
for update
to authenticated
using (
  public.is_current_user_admin()
)
with check (
  public.is_current_user_admin()
);

create policy "players_admin_delete"
on public.players
for delete
to authenticated
using (
  public.is_current_user_admin()
);
