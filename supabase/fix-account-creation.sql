-- Perbaikan instalasi lama: jalankan seluruh file di SQL Editor Supabase.
-- Tidak menghapus akun, kelas, keanggotaan, atau nilai.
begin;

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles(id,full_name,role)
  values(new.id,left(coalesce(nullif(trim(new.raw_user_meta_data->>'full_name'),''),'Murid'),100),'murid');
  return new;
end;
$$;

create or replace function public.ensure_provisioned_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  -- Baca data terakhir, bukan snapshot NEW ketika INSERT pertama berlangsung.
  -- Supabase Auth Admin API mengisi app_metadata sesudah INSERT.
  if exists(select 1 from auth.users where id=new.id
    and coalesce(raw_app_meta_data->>'provisioned','false')<>'true') then
    raise exception 'Akun hanya dapat dibuat oleh admin atau guru.';
  end if;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
for each row execute function public.handle_new_user();

drop trigger if exists on_auth_user_provisioned on auth.users;
create constraint trigger on_auth_user_provisioned after insert on auth.users
deferrable initially deferred for each row execute function public.ensure_provisioned_user();

revoke all on function public.handle_new_user(),public.ensure_provisioned_user() from public,anon,authenticated;
commit;
