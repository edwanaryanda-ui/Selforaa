-- ============================================================
-- Selfora Tahap 2 – Skema Supabase (jalankan di SQL Editor)
-- Sudah termasuk peran ADMIN. Aman dijalankan berulang kali (idempotent), juga di database lama. Kode konselor tidak ditimpa jika sudah ada;
-- untuk mengubahnya: update public.app_settings set value='KODE-BARU' where key='counselor_code';
-- ============================================================

-- Pengaturan rahasia (RLS aktif tanpa policy = tidak bisa dibaca dari browser)
create table if not exists public.app_settings (key text primary key, value text not null);
alter table public.app_settings enable row level security;
insert into public.app_settings values ('counselor_code', 'GANTI-KODE-RAHASIA-BK') on conflict (key) do nothing;  -- << UBAH INI

-- ---------- Profil (peran akun) ----------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null,
  role text not null check (role in ('mahasiswa','konselor','admin')),
  created_at timestamptz default now()
);

-- Profil dibuat otomatis saat daftar. Peran konselor hanya bisa dibuat dengan kode rahasia.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare r text := coalesce(new.raw_user_meta_data->>'role','mahasiswa');
begin
  if r = 'konselor' then
    if coalesce(new.raw_user_meta_data->>'code','') <> (select value from app_settings where key='counselor_code') then
      raise exception 'Kode registrasi konselor salah';
    end if;
  else r := 'mahasiswa'; end if;
  insert into profiles(id,name,role)
  values (new.id, coalesce(nullif(trim(new.raw_user_meta_data->>'name'),''),'Pengguna'), r);
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.is_counselor() returns boolean
language sql security definer stable set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and role = 'konselor')
$$;

-- ---------- Tabel ----------
create table if not exists public.materials (
  id int primary key, icon text, title text not null, intro text,
  body jsonb not null default '[]', example text, q jsonb not null default '[]'
);
create table if not exists public.material_answers (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  material_id int not null, answers jsonb not null default '[]', updated_at timestamptz default now(),
  primary key (user_id, material_id)
);
create table if not exists public.progress (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  material_id int not null, completed_at timestamptz default now(),
  primary key (user_id, material_id)
);
create table if not exists public.checkins (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  date date not null, mood text, feel text, exp text, grat text,
  unique (user_id, date)
);
create table if not exists public.journals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text not null check (char_length(title) <= 80), body text not null,
  created_at timestamptz default now()
);
create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  student_name text, student_email text,
  category text not null check (category in ('Pertanyaan tentang materi','Masukan untuk website','Permintaan arahan BK')),
  subject text not null check (char_length(subject) between 1 and 100),
  body text not null check (char_length(body) between 1 and 4000),
  status text not null default 'menunggu' check (status in ('menunggu','dibalas')),
  counselor_seen boolean not null default false,
  created_at timestamptz default now()
);
create table if not exists public.replies (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.messages(id) on delete cascade,
  counselor_id uuid not null default auth.uid() references auth.users(id),
  counselor_name text,
  body text not null check (char_length(body) between 1 and 4000),
  seen boolean not null default false,
  created_at timestamptz default now()
);

-- ---------- Trigger: identitas diisi server (tidak bisa dipalsukan) ----------
create or replace function public.set_message_meta() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  select name into new.student_name from profiles where id = new.student_id;
  select email into new.student_email from auth.users where id = new.student_id;
  new.status := 'menunggu'; new.counselor_seen := false;
  return new;
end $$;
drop trigger if exists trg_message_meta on public.messages;
create trigger trg_message_meta before insert on public.messages
  for each row execute function public.set_message_meta();

create or replace function public.set_reply_meta() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  select name into new.counselor_name from profiles where id = new.counselor_id;
  new.seen := false;
  return new;
end $$;
drop trigger if exists trg_reply_meta on public.replies;
create trigger trg_reply_meta before insert on public.replies
  for each row execute function public.set_reply_meta();

create or replace function public.mark_replied() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update messages set status = 'dibalas' where id = new.message_id;
  return new;
end $$;
drop trigger if exists trg_mark_replied on public.replies;
create trigger trg_mark_replied after insert on public.replies
  for each row execute function public.mark_replied();

-- ---------- Row Level Security (hak akses di sisi database) ----------
alter table public.profiles         enable row level security;
alter table public.materials        enable row level security;
alter table public.material_answers enable row level security;
alter table public.progress         enable row level security;
alter table public.checkins         enable row level security;
alter table public.journals         enable row level security;
alter table public.messages         enable row level security;
alter table public.replies          enable row level security;

drop policy if exists "profil sendiri" on public.profiles;
create policy "profil sendiri" on profiles for select to authenticated using (id = auth.uid());

drop policy if exists "materi dibaca semua" on public.materials;
create policy "materi dibaca semua" on materials for select to authenticated using (true);
drop policy if exists "materi dikelola konselor" on public.materials;
create policy "materi dikelola konselor" on materials for all to authenticated
  using (is_counselor()) with check (is_counselor());

-- Data pribadi: HANYA pemilik. Konselor tidak punya akses sama sekali.
drop policy if exists "jawaban milik sendiri" on public.material_answers;
create policy "jawaban milik sendiri" on material_answers for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "progres milik sendiri" on public.progress;
create policy "progres milik sendiri" on progress for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "refleksi milik sendiri" on public.checkins;
create policy "refleksi milik sendiri" on checkins for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "jurnal milik sendiri" on public.journals;
create policy "jurnal milik sendiri" on journals for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Pesan: mahasiswa melihat miliknya; konselor melihat semua pesan umpan balik
drop policy if exists "mhs lihat pesan sendiri" on public.messages;
create policy "mhs lihat pesan sendiri" on messages for select to authenticated using (student_id = auth.uid());
drop policy if exists "bk lihat semua pesan" on public.messages;
create policy "bk lihat semua pesan"    on messages for select to authenticated using (is_counselor());
drop policy if exists "mhs kirim pesan" on public.messages;
create policy "mhs kirim pesan"         on messages for insert to authenticated
  with check (student_id = auth.uid() and not is_counselor());
drop policy if exists "bk tandai pesan" on public.messages;
create policy "bk tandai pesan"         on messages for update to authenticated
  using (is_counselor()) with check (is_counselor());
revoke update on public.messages from authenticated, anon;
grant  update (counselor_seen) on public.messages to authenticated;

drop policy if exists "mhs lihat balasan" on public.replies;
create policy "mhs lihat balasan" on replies for select to authenticated
  using (exists (select 1 from messages m where m.id = message_id and m.student_id = auth.uid()));
drop policy if exists "bk lihat balasan" on public.replies;
create policy "bk lihat balasan"  on replies for select to authenticated using (is_counselor());
drop policy if exists "bk kirim balasan" on public.replies;
create policy "bk kirim balasan"  on replies for insert to authenticated
  with check (is_counselor() and counselor_id = auth.uid());
drop policy if exists "mhs tandai balasan dibaca" on public.replies;
create policy "mhs tandai balasan dibaca" on replies for update to authenticated
  using (exists (select 1 from messages m where m.id = message_id and m.student_id = auth.uid()))
  with check (true);
revoke update on public.replies from authenticated, anon;
grant  update (seen) on public.replies to authenticated;

-- ---------- Peran ADMIN ----------
-- Untuk database lama: perluas pengecekan peran agar menerima 'admin'
do $$ declare c record; begin
  for c in select conname from pg_constraint
           where conrelid = 'public.profiles'::regclass and contype = 'c' and pg_get_constraintdef(oid) ilike '%role%' loop
    execute format('alter table public.profiles drop constraint %I', c.conname);
  end loop;
  alter table public.profiles add constraint profiles_role_check check (role in ('mahasiswa','konselor','admin'));
end $$;

-- Admin tidak bisa dibuat dari form Daftar (handle_new_user hanya menerima mahasiswa/konselor).
create or replace function public.is_admin() returns boolean
language sql security definer stable set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and role = 'admin')
$$;

-- Admin boleh mengelola materi
drop policy if exists "materi dikelola admin" on public.materials;
create policy "materi dikelola admin" on materials for all to authenticated
  using (is_admin()) with check (is_admin());

-- Ringkasan angka (tanpa isi jurnal/refleksi/pesan)
create or replace function public.admin_overview() returns json
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'Akses ditolak'; end if;
  return json_build_object(
    'mahasiswa', (select count(*) from profiles where role = 'mahasiswa'),
    'konselor',  (select count(*) from profiles where role = 'konselor'),
    'pesan',     (select count(*) from messages),
    'menunggu',  (select count(*) from messages where status = 'menunggu'),
    'materi',    (select count(*) from materials));
end $$;

-- Daftar akun
create or replace function public.admin_list_users()
returns table (id uuid, name text, email text, role text, created_at timestamptz)
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'Akses ditolak'; end if;
  return query select p.id, p.name, u.email::text, p.role, u.created_at
               from profiles p join auth.users u on u.id = p.id order by u.created_at desc;
end $$;

-- Hapus akun (bukan diri sendiri, bukan admin). Balasan milik konselor yang dihapus ikut terhapus.
create or replace function public.admin_delete_user(uid uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'Akses ditolak'; end if;
  if uid = auth.uid() then raise exception 'Tidak bisa menghapus akunmu sendiri'; end if;
  if exists (select 1 from profiles where id = uid and role = 'admin') then raise exception 'Akun admin tidak bisa dihapus dari sini'; end if;
  delete from replies where counselor_id = uid;
  delete from auth.users where id = uid;
end $$;

revoke all on function public.is_admin(), public.admin_overview(), public.admin_list_users(), public.admin_delete_user(uuid) from public, anon;
grant execute on function public.is_admin(), public.admin_overview(), public.admin_list_users(), public.admin_delete_user(uuid) to authenticated;

-- JADIKAN AKUNMU ADMIN: daftar dulu sebagai mahasiswa lewat form, lalu ganti email dan jalankan baris ini:
-- update public.profiles set role = 'admin' where id = (select id from auth.users where email = 'emailmu@contoh.id');

-- ---------- Notifikasi real-time ----------
do $$ begin
  begin alter publication supabase_realtime add table public.messages; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.replies;  exception when duplicate_object then null; end;
end $$;
