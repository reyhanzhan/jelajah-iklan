-- Jalankan sekali di proyek Supabase baru. Buat akun admin awal melalui
-- Authentication > Users sebelum menjalankan file ini; lihat README.md.
begin;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null check (char_length(full_name) between 1 and 100),
  role text not null default 'murid' check (role in ('admin','guru','murid')),
  created_at timestamptz not null default now()
);
create table public.classes (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 1 and 80),
  teacher_id uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);
create table public.memberships (
  class_id uuid references public.classes(id) on delete cascade,
  student_id uuid references public.profiles(id) on delete cascade,
  primary key (class_id,student_id)
);
create table public.attempts (
  id uuid primary key,
  student_id uuid not null references public.profiles(id) on delete cascade,
  activity text not null check (activity in ('materi','game','puzzle','soal')),
  correct integer not null,
  total integer not null check (total between 1 and 1000),
  created_at timestamptz not null default now(),
  check (correct between 0 and total)
);
create table public.quiz_keys (
  id integer primary key check (id=1),
  answers jsonb not null
);
create index on public.classes(teacher_id);
create index on public.memberships(student_id);
create index on public.attempts(student_id,created_at desc);

alter table public.profiles enable row level security;
alter table public.classes enable row level security;
alter table public.memberships enable row level security;
alter table public.attempts enable row level security;
alter table public.quiz_keys enable row level security;

create function public.current_role() returns text
language sql stable security definer set search_path = ''
as $$ select role from public.profiles where id=auth.uid() $$;
create function public.teaches(student uuid) returns boolean
language sql stable security definer set search_path = ''
as $$ select exists(select 1 from public.memberships m join public.classes c on c.id=m.class_id where m.student_id=student and c.teacher_id=auth.uid()) $$;
create function public.owns_class(target uuid) returns boolean
language sql stable security definer set search_path = ''
as $$ select exists(select 1 from public.classes where id=target and teacher_id=auth.uid()) $$;
create function public.in_class(target uuid) returns boolean
language sql stable security definer set search_path = ''
as $$ select exists(select 1 from public.memberships where class_id=target and student_id=auth.uid()) $$;

create policy profile_read on public.profiles for select to authenticated
using (id=auth.uid() or public.current_role()='admin' or (public.current_role()='guru' and public.teaches(id)));
create policy class_read on public.classes for select to authenticated
using (public.current_role()='admin' or teacher_id=auth.uid() or public.in_class(id));
create policy class_create on public.classes for insert to authenticated
with check (public.current_role() in ('admin','guru') and teacher_id=auth.uid());
create policy membership_read on public.memberships for select to authenticated
using (student_id=auth.uid() or public.current_role()='admin' or (public.current_role()='guru' and public.owns_class(class_id)));
create policy attempt_read on public.attempts for select to authenticated
using (student_id=auth.uid() or public.current_role()='admin' or (public.current_role()='guru' and public.teaches(student_id)));

-- Tidak ada write policy untuk profiles/memberships/attempts.
-- Pembuatan akun memakai Edge Function, role dan nilai memakai RPC tervalidasi.
revoke all on public.profiles,public.classes,public.memberships,public.attempts,public.quiz_keys from anon,authenticated;
grant select on public.profiles,public.classes,public.memberships,public.attempts to authenticated;
grant insert on public.classes to authenticated;
grant all on public.profiles,public.classes,public.memberships,public.attempts,public.quiz_keys to service_role;

create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if coalesce(new.raw_app_meta_data->>'provisioned','false') <> 'true' then
    raise exception 'Akun hanya dapat dibuat oleh admin atau guru.';
  end if;
  insert into public.profiles(id,full_name,role)
  values(new.id,left(coalesce(nullif(trim(new.raw_user_meta_data->>'full_name'),''),'Murid'),100),'murid');
  return new;
end;
$$;
-- Akun awal yang sudah dibuat sebelum migrasi.
insert into public.profiles(id,full_name)
select id,left(coalesce(nullif(raw_user_meta_data->>'full_name',''),'Admin Sekolah'),100) from auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute procedure public.handle_new_user();

create function public.set_user_role(target_id uuid,new_role text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if public.current_role() is distinct from 'admin' then raise exception 'Hanya admin dapat mengubah role.'; end if;
  if target_id=auth.uid() then raise exception 'Role akun sendiri tidak dapat diubah.'; end if;
  if new_role is null or new_role not in ('admin','guru','murid') then raise exception 'Role tidak valid.'; end if;
  if new_role='murid' and exists(select 1 from public.classes where teacher_id=target_id) then raise exception 'Akun ini masih mengajar kelas.'; end if;
  if new_role<>'murid' then delete from public.memberships where student_id=target_id; end if;
  update public.profiles set role=new_role where id=target_id;
  if not found then raise exception 'Akun tidak ditemukan.'; end if;
end;
$$;

create function public.record_attempt(event_id uuid,activity text,correct_count integer,total_count integer,submitted_answers jsonb default null) returns void
language plpgsql security definer set search_path = '' as $$
declare
  answer_key jsonb;
  calculated integer;
begin
  if public.current_role() is distinct from 'murid' then raise exception 'Hanya murid dapat menyimpan hasil.'; end if;
  if activity is null or activity not in ('materi','game','puzzle','soal') then raise exception 'Kegiatan tidak valid.'; end if;
  if activity='soal' then
    select answers into answer_key from public.quiz_keys where id=1;
    if answer_key is null then raise exception 'Bank soal belum dipasang.'; end if;
    if submitted_answers is null or jsonb_typeof(submitted_answers)<>'array' then raise exception 'Jawaban tidak valid.'; end if;
    if jsonb_array_length(submitted_answers)<>jsonb_array_length(answer_key) then raise exception 'Jawaban belum lengkap.'; end if;
    if exists(select 1 from jsonb_array_elements(submitted_answers) a where a not in ('0'::jsonb,'1'::jsonb,'2'::jsonb,'3'::jsonb)) then raise exception 'Pilihan jawaban tidak valid.'; end if;
    select count(*) into calculated from jsonb_array_elements(submitted_answers) with ordinality a(value,n) where a.value=answer_key->(a.n::integer-1);
    correct_count:=calculated;
    total_count:=jsonb_array_length(answer_key);
  end if;
  if correct_count is null or total_count is null or total_count<1 or total_count>1000 or correct_count<0 or correct_count>total_count then raise exception 'Hasil tidak valid.'; end if;
  if activity='materi' and (correct_count<>7 or total_count<>7) then raise exception 'Materi tidak valid.'; end if;
  if activity='puzzle' and total_count<>3 then raise exception 'Puzzle tidak valid.'; end if;
  insert into public.attempts(id,student_id,activity,correct,total)
  values(event_id,auth.uid(),activity,correct_count,total_count)
  on conflict(id) do nothing;
end;
$$;

revoke all on function public.current_role(),public.teaches(uuid),public.owns_class(uuid),public.in_class(uuid),public.handle_new_user(),public.set_user_role(uuid,text),public.record_attempt(uuid,text,integer,integer,jsonb) from public,anon;
grant execute on function public.current_role(),public.teaches(uuid),public.owns_class(uuid),public.in_class(uuid),public.set_user_role(uuid,text),public.record_attempt(uuid,text,integer,integer,jsonb) to authenticated;
commit;
