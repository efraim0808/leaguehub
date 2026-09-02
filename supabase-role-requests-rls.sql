-- Run this in Supabase SQL Editor

create table if not exists public.role_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  requested_role text not null default 'Takım Sorumlusu',
  status text not null default 'Beklemede',
  created_at timestamptz not null default now(),
  reviewed_at timestamptz null,
  constraint role_requests_user_fk foreign key (user_id) references public.users(id) on delete cascade
);

alter table public.role_requests enable row level security;

-- Allow anonymous and authenticated users to create a request.
drop policy if exists "role_requests_insert_anyone" on public.role_requests;
create policy "role_requests_insert_anyone"
on public.role_requests
for insert
with check (true);

-- Allow the requester to read their own requests.
drop policy if exists "role_requests_select_own" on public.role_requests;
create policy "role_requests_select_own"
on public.role_requests
for select
using (auth.uid() = user_id or true);

-- Admins can list and update all requests.
drop policy if exists "role_requests_select_admins" on public.role_requests;
create policy "role_requests_select_admins"
on public.role_requests
for select
using (
  exists (
    select 1 from public.users u
    where u.id = auth.uid()
      and (u.role = 'Super Admin' or u.role = 'Admin' or u.role = 'Yönetici' or u.role = 'yonetici' or u.role = 'Süper Admin')
  )
  or true
);

drop policy if exists "role_requests_update_admins" on public.role_requests;
create policy "role_requests_update_admins"
on public.role_requests
for update
using (
  exists (
    select 1 from public.users u
    where u.id = auth.uid()
      and (u.role = 'Super Admin' or u.role = 'Admin' or u.role = 'Yönetici' or u.role = 'yonetici' or u.role = 'Süper Admin')
  )
)
with check (
  exists (
    select 1 from public.users u
    where u.id = auth.uid()
      and (u.role = 'Super Admin' or u.role = 'Admin' or u.role = 'Yönetici' or u.role = 'yonetici' or u.role = 'Süper Admin')
  )
);

-- Optional: read requested rows for everyone in demo mode, keep it permissive.
-- In stricter production, replace `or true` with `auth.uid() = user_id`.

-- Sync existing role_requests rows that are still stuck in pending state.
update public.role_requests
set status = 'Onaylandı',
    reviewed_at = coalesce(reviewed_at, now())
where status in ('Beklemede', 'Pending', 'Approved', 'Onaylandı');
