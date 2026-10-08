-- Jalankan seluruh file di SQL Editor (role postgres), setelah schema.sql + seed.sql.
-- Isi tiga nilai sandi di bawah sebelum menjalankan template ini.
-- Akun yang sudah dibuat oleh script ini tidak direset sandinya saat diulang.
begin;
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

do $bootstrap$
declare
  account record;
  account_id uuid;
  password_hash text;
  crypto_schema text;
  existing_marker text;
  initial_teacher_id uuid;
  initial_student_id uuid;
  classroom_id uuid;
begin
  if to_regclass('public.profiles') is null or to_regclass('public.classes') is null
     or to_regclass('public.memberships') is null then
    raise exception 'Tabel aplikasi belum terpasang. Jalankan seluruh schema.sql dan seed.sql dahulu.';
  end if;
  perform pg_advisory_xact_lock(hashtext('jelajah-initial-accounts-v1'));
  select n.nspname into crypto_schema from pg_extension e
    join pg_namespace n on n.oid=e.extnamespace where e.extname='pgcrypto';

  for account in select * from (values
    ('admin@jelajah-iklan.test', 'Admin', 'admin', 'REPLACE_ADMIN_PASSWORD'),
    ('guru@jelajah-iklan.test', 'Guru', 'guru', 'REPLACE_GURU_PASSWORD'),
    ('siswa@jelajah-iklan.test', 'Siswa', 'murid', 'REPLACE_SISWA_PASSWORD')
  ) as initial_accounts(email, full_name, app_role, initial_password)
  loop
    if account.initial_password like 'REPLACE_%' or length(account.initial_password)<6 then
      raise exception 'Isi sandi akun awal sebelum menjalankan query.';
    end if;
    account_id:=null;
    select id,raw_app_meta_data->>'initial_accounts' into account_id,existing_marker
      from auth.users where lower(email)=account.email;
    if account_id is not null and existing_marker is distinct from 'jelajah-v1' then
      raise exception 'Email % sudah dipakai akun lain; tidak ada akun yang diubah.',account.email;
    end if;
    if account_id is null then
      account_id:=gen_random_uuid();
      execute format('select %I.crypt($1,%I.gen_salt(''bf'',10))',crypto_schema,crypto_schema)
        into password_hash using account.initial_password;
      insert into auth.users (
        instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,
        raw_app_meta_data,raw_user_meta_data,created_at,updated_at,
        confirmation_token,recovery_token,email_change_token_new,email_change,
        email_change_token_current,reauthentication_token,phone_change,phone_change_token,
        email_change_confirm_status,is_super_admin,is_sso_user,is_anonymous
      ) values (
        '00000000-0000-0000-0000-000000000000',account_id,'authenticated','authenticated',
        account.email,password_hash,now(),
        jsonb_build_object('provider','email','providers',jsonb_build_array('email'),'provisioned',true,'initial_accounts','jelajah-v1'),
        jsonb_build_object('full_name',account.full_name),now(),now(),
        '','','','','','','','',0,false,false,false
      );
    end if;

    insert into auth.identities (id,user_id,provider_id,provider,identity_data,created_at,updated_at)
    values (gen_random_uuid(),account_id,account_id::text,'email',
      jsonb_build_object('sub',account_id::text,'email',account.email,'email_verified',true,'phone_verified',false),now(),now())
    on conflict (provider_id,provider) do nothing;

    -- Trigger aplikasi membuat profil awal sebagai murid; set role aplikasi di sini.
    insert into public.profiles(id,full_name,role)
    values(account_id,account.full_name,account.app_role)
    on conflict(id) do update set full_name=excluded.full_name,role=excluded.role;
    if account.app_role='guru' then initial_teacher_id:=account_id; end if;
    if account.app_role='murid' then initial_student_id:=account_id; end if;
  end loop;

  select c.id into classroom_id from public.classes c
    where c.teacher_id=initial_teacher_id and c.name='Kelas Jelajah Iklan'
    order by c.created_at limit 1;
  if classroom_id is null then
    insert into public.classes(name,teacher_id) values('Kelas Jelajah Iklan',initial_teacher_id)
    returning id into classroom_id;
  end if;
  insert into public.memberships(class_id,student_id) values(classroom_id,initial_student_id)
    on conflict do nothing;
end;
$bootstrap$;
commit;

select split_part(u.email,'@',1) as nama_login,u.email,p.full_name,p.role,'AKUN SIAP' as status
from auth.users u join public.profiles p on p.id=u.id
where u.email in ('admin@jelajah-iklan.test','guru@jelajah-iklan.test','siswa@jelajah-iklan.test')
order by case p.role when 'admin' then 1 when 'guru' then 2 else 3 end;
