-- =========================================================
-- LeagueHub Password Reset Requests Migration
-- Run this in Supabase SQL Editor
-- =========================================================

create table if not exists public.password_reset_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users(id) on delete cascade,
  username text not null,
  email text,
  status text not null default 'pending' check (status in ('pending', 'resolved')),
  note text,
  temporary_password text,
  requested_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid,
  created_at timestamptz not null default now()
);

create index if not exists password_reset_requests_username_idx
  on public.password_reset_requests (username);

create index if not exists password_reset_requests_status_idx
  on public.password_reset_requests (status);

alter table public.password_reset_requests enable row level security;

create policy "Users can read their own reset requests"
  on public.password_reset_requests
  for select
  using (
    auth.uid() is not null
    and (
      user_id = auth.uid()
      or exists (
        select 1 from public.users u
        where u.id = auth.uid()
          and u.role in ('Super Admin', 'Admin')
      )
    )
  );

create policy "Admins can insert reset requests"
  on public.password_reset_requests
  for insert
  with check (
    auth.uid() is not null
    and exists (
      select 1 from public.users u
      where u.id = auth.uid()
        and u.role in ('Super Admin', 'Admin')
    )
  );

create policy "Authenticated users can create their own reset requests"
  on public.password_reset_requests
  for insert
  with check (
    auth.uid() is not null
    and user_id = auth.uid()
  );

create policy "Admins can update reset requests"
  on public.password_reset_requests
  for update
  using (
    auth.uid() is not null
    and exists (
      select 1 from public.users u
      where u.id = auth.uid()
        and u.role in ('Super Admin', 'Admin')
    )
  )
  with check (
    auth.uid() is not null
    and exists (
      select 1 from public.users u
      where u.id = auth.uid()
        and u.role in ('Super Admin', 'Admin')
    )
  );

create or replace function public.request_password_reset(p_username text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user public.users%rowtype;
  v_request_exists boolean;
begin
  if p_username is null or trim(p_username) = '' then
    return 'Kullanıcı adı gereklidir.';
  end if;

  select * into v_user
  from public.users
  where username = trim(p_username)
  limit 1;

  if v_user.id is null then
    return 'Bu kullanıcı adına ait hesap bulunamadı.';
  end if;

  select exists (
    select 1
    from public.password_reset_requests
    where username = v_user.username
      and status = 'pending'
      and requested_at > now() - interval '24 hours'
  ) into v_request_exists;

  if v_request_exists then
    return 'Bu kullanıcı için son 24 saat içinde aktif bir sıfırlama talebi zaten var.';
  end if;

  insert into public.password_reset_requests (user_id, username, email, status)
  values (v_user.id, v_user.username, v_user.email, 'pending');

  return 'Şifre sıfırlama talebi oluşturuldu. Yönetici inceleyecek.';
end;
$$;

create or replace function public.admin_reset_user_password(p_user_id uuid, p_new_password text, p_request_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin_role text;
  v_user public.users%rowtype;
begin
  if p_user_id is null or p_new_password is null or trim(p_new_password) = '' then
    return 'Kullanıcı veya yeni şifre eksik.';
  end if;

  select role into v_admin_role
  from public.users
  where id = auth.uid();

  if v_admin_role is null or v_admin_role not in ('Super Admin', 'Admin') then
    return 'Yetkiniz yok.';
  end if;

  select * into v_user
  from public.users
  where id = p_user_id;

  if v_user.id is null then
    return 'Kullanıcı bulunamadı.';
  end if;

  update auth.users
  set encrypted_password = crypt(p_new_password, gen_salt('bf'))
  where id = p_user_id;

  update public.users
  set password = p_new_password,
      updated_at = now()
  where id = p_user_id;

  update public.password_reset_requests
  set status = 'resolved',
      temporary_password = p_new_password,
      resolved_at = now(),
      resolved_by = auth.uid(),
      note = 'Yönetici tarafından çözüldü.'
  where id = p_request_id;

  return 'Şifre başarıyla güncellendi.';
end;
$$;

grant usage on schema public to anon, authenticated;
grant select, insert, update on public.password_reset_requests to authenticated;
grant execute on function public.request_password_reset(text) to authenticated;
grant execute on function public.admin_reset_user_password(uuid, text, uuid) to authenticated;
