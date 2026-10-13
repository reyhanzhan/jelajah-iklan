-- Jalankan di SQL Editor setelah schema.sql, termasuk untuk instalasi lama.
begin;
alter table public.profiles add column if not exists email text;
update public.profiles p set email=u.email from auth.users u where u.id=p.id;

create or replace function public.sync_account_profile() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.profiles set email=new.email,
    full_name=left(coalesce(nullif(trim(new.raw_user_meta_data->>'full_name'),''),full_name),100)
  where id=new.id;
  return new;
end;
$$;
-- Setelah on_auth_user_created agar profil baru sudah tersedia.
drop trigger if exists zz_sync_account_profile on auth.users;
create trigger zz_sync_account_profile after insert or update of email,raw_user_meta_data on auth.users
for each row execute function public.sync_account_profile();
revoke all on function public.sync_account_profile() from public,anon,authenticated;

create or replace function public.manage_class(action text,target_id uuid,class_name text default null,new_teacher_id uuid default null) returns void
language plpgsql security definer set search_path = '' as $$
declare owner_id uuid;
begin
  select teacher_id into owner_id from public.classes where id=target_id for update;
  if not found then raise exception 'Kelas tidak ditemukan.'; end if;
  if public.current_role() is distinct from 'admin' and
    (public.current_role() is distinct from 'guru' or owner_id<>auth.uid()) then
    raise exception 'Anda tidak dapat mengelola kelas ini.';
  end if;
  if action='delete' then
    delete from public.classes where id=target_id;
  elsif action='update' then
    if class_name is null or char_length(trim(class_name)) not between 1 and 80 then raise exception 'Nama kelas harus diisi, maksimal 80 karakter.'; end if;
    new_teacher_id:=coalesce(new_teacher_id,owner_id);
    if new_teacher_id<>owner_id and public.current_role()<>'admin' then raise exception 'Hanya admin dapat mengganti pengajar.'; end if;
    if not exists(select 1 from public.profiles where id=new_teacher_id and role in ('admin','guru')) then raise exception 'Pengajar tidak valid.'; end if;
    update public.classes set name=trim(class_name),teacher_id=new_teacher_id where id=target_id;
  else raise exception 'Tindakan tidak valid.';
  end if;
end;
$$;
revoke all on function public.manage_class(text,uuid,text,uuid) from public,anon;
grant execute on function public.manage_class(text,uuid,text,uuid) to authenticated;
commit;
