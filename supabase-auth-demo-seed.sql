-- =========================================================
-- LeagueHub - Real Supabase auth + profiles + teams + players demo seed
-- Compatible with app flow: Supabase Auth signUp / signInWithPassword + profiles table
-- =========================================================

create extension if not exists pgcrypto;

-- Optional safety reset for demo data only
-- delete from public.players;
-- delete from public.teams;
-- delete from public.profiles;
-- delete from public.users;
-- delete from auth.users where email in (
--   'sagliksk@gmail.com',
--   'admin@leaguehub.com',
--   'saglik.manager@leaguehub.com',
--   'mediterra.manager@leaguehub.com',
--   'asist.manager@leaguehub.com',
--   'imed.manager@leaguehub.com',
--   'visitor@leaguehub.com'
-- );

-- =========================================================
-- 1) Real auth.users records
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
on conflict (id) do update set
  email = excluded.email,
  encrypted_password = excluded.encrypted_password,
  raw_user_meta_data = excluded.raw_user_meta_data,
  updated_at = now();

-- =========================================================
-- 2) Matching app profile rows (for app session hydration)
-- =========================================================
insert into public.profiles (
  id,
  email,
  full_name,
  username,
  role,
  team_id,
  team_manager_request,
  permissions,
  avatar_url,
  created_at
)
values
  (
    'fa4d4e82-41ab-4c8e-9d66-7b3a4d17d3a2',
    'sagliksk@gmail.com',
    'Efraim Yılmaz',
    'EFRAIMYILMAZ',
    'Super Admin',
    null,
    false,
    '{"fikstur": true, "puanDurumu": true, "canliSkor": true, "disiplin": true, "takimOnaylari": true, "takimYonetimi": true, "galeri": true, "duyurular": true, "ayarlar": true}'::jsonb,
    null,
    now()
  ),
  (
    '7d8fe4f0-4e7d-4fa9-8a8d-7a1d8d0f5918',
    'admin@leaguehub.com',
    'Merve Demir',
    'MERVEDemir',
    'Admin',
    null,
    false,
    '{"fikstur": true, "puanDurumu": true, "canliSkor": true, "disiplin": true, "takimOnaylari": true, "takimYonetimi": false, "galeri": true, "duyurular": true, "ayarlar": true}'::jsonb,
    null,
    now()
  ),
  (
    '1156d5d3-b169-42a2-98bb-5d3cd96f77c2',
    'saglik.manager@leaguehub.com',
    'Ali Kaya',
    'ALIKAYA',
    'Team Manager',
    '6f36df94-658a-4ec1-92e3-88442c4b4d34',
    false,
    '{"fikstur": false, "puanDurumu": true, "canliSkor": true, "disiplin": true, "takimOnaylari": false, "takimYonetimi": true, "galeri": false, "duyurular": true, "ayarlar": false}'::jsonb,
    null,
    now()
  ),
  (
    '9ba6d596-2fd7-4c76-b385-64d1df3b4fd3',
    'mediterra.manager@leaguehub.com',
    'Bora Aydın',
    'BORAAYDIN',
    'Team Manager',
    'af4140d4-b960-4eaf-b63f-c7f9bc7d2d28',
    false,
    '{"fikstur": false, "puanDurumu": true, "canliSkor": true, "disiplin": true, "takimOnaylari": false, "takimYonetimi": true, "galeri": false, "duyurular": true, "ayarlar": false}'::jsonb,
    null,
    now()
  ),
  (
    'd4f65d95-2d58-4d14-ab90-c8ad4a1189c8',
    'asist.manager@leaguehub.com',
    'Cem Reşit',
    'CEMRESIT',
    'Team Manager',
    'cf3a0796-3bbd-4284-8f33-9e1efe4cc3d7',
    false,
    '{"fikstur": false, "puanDurumu": true, "canliSkor": true, "disiplin": true, "takimOnaylari": false, "takimYonetimi": true, "galeri": false, "duyurular": true, "ayarlar": false}'::jsonb,
    null,
    now()
  ),
  (
    '6f2222f5-0761-4d44-a30c-b037dd5d2d39',
    'imed.manager@leaguehub.com',
    'Deniz Koral',
    'DENIZKORAL',
    'Team Manager',
    'deb7f523-8d53-47db-9ec7-fd074f0bc0e5',
    false,
    '{"fikstur": false, "puanDurumu": true, "canliSkor": true, "disiplin": true, "takimOnaylari": false, "takimYonetimi": true, "galeri": false, "duyurular": true, "ayarlar": false}'::jsonb,
    null,
    now()
  ),
  (
    '4d87e0dc-09df-47cf-b9ec-431f76caef55',
    'visitor@leaguehub.com',
    'Nur Şahin',
    'NURSahin',
    'Visitor',
    null,
    true,
    '{"fikstur": false, "puanDurumu": false, "canliSkor": false, "disiplin": false, "takimOnaylari": false, "takimYonetimi": false, "galeri": false, "duyurular": false, "ayarlar": false}'::jsonb,
    null,
    now()
  )
on conflict (id) do update set
  email = excluded.email,
  full_name = excluded.full_name,
  username = excluded.username,
  role = excluded.role,
  team_id = excluded.team_id,
  team_manager_request = excluded.team_manager_request,
  permissions = excluded.permissions,
  avatar_url = excluded.avatar_url;

-- =========================================================
-- 3) App users table (used by login + local app logic)
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
on conflict (id) do update set
  full_name = excluded.full_name,
  email = excluded.email,
  password = excluded.password,
  username = excluded.username,
  role = excluded.role,
  team_id = excluded.team_id,
  team_manager_request = excluded.team_manager_request,
  permissions = excluded.permissions;

-- =========================================================
-- 4) Team seed
-- =========================================================
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

-- =========================================================
-- 5) Player seed for each team
-- =========================================================
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

-- =========================================================
-- 6) Real app login test flow (JS / TS)
-- =========================================================
-- Example: after the insert above, these are the login scenarios the app should accept:
--
-- const { data, error } = await supabase.auth.signInWithPassword({
--   email: 'saglik.manager@leaguehub.com',
--   password: 'team123'
-- })
--
-- const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
--   email: 'newuser@leaguehub.com',
--   password: 'StrongPass123!',
--   options: {
--     data: {
--       full_name: 'Yeni Üye',
--       username: 'YENIUEE'
--     }
--   }
-- })
--
-- // Then ensure profile row is created in public.profiles
-- // App session hydration will read profile by id and populate the app session.
--
-- =========================================================
-- 7) Optional verification queries
-- =========================================================
-- select id, email, role from auth.users where email in (
--   'sagliksk@gmail.com',
--   'admin@leaguehub.com',
--   'saglik.manager@leaguehub.com',
--   'visitor@leaguehub.com'
-- );
--
-- select p.id, p.email, p.full_name, p.role, p.team_id
-- from public.profiles p
-- order by p.role, p.email;
--
-- select t.name, count(pl.id) as player_count
-- from public.teams t
-- left join public.players pl on pl.team_id = t.id
-- group by t.id, t.name
-- order by t.name;
