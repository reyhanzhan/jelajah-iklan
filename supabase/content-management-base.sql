-- Upgrade bank konten. Generator menambahkan konten awal ke content-management.sql.
begin;
create table if not exists public.learning_versions (
  id uuid primary key default gen_random_uuid(),
  data jsonb not null,
  edited_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create table if not exists public.learning_current (
  id integer primary key check(id=1),
  revision uuid not null references public.learning_versions(id)
);
create table if not exists public.essay_submissions (
  id uuid primary key,
  student_id uuid not null references public.profiles(id) on delete cascade,
  revision uuid not null references public.learning_versions(id),
  answers jsonb not null,
  created_at timestamptz not null default now()
);
alter table public.learning_versions enable row level security;
alter table public.learning_current enable row level security;
alter table public.essay_submissions enable row level security;
revoke all on public.learning_versions,public.learning_current,public.essay_submissions from anon,authenticated;
grant select on public.essay_submissions to authenticated;
grant all on public.learning_versions,public.learning_current,public.essay_submissions to service_role;
drop policy if exists essay_read on public.essay_submissions;
create policy essay_read on public.essay_submissions for select to authenticated
using (student_id=auth.uid() or public.current_role()='admin' or (public.current_role()='guru' and public.teaches(student_id)));

create or replace function public.get_learning_content() returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
  if coalesce(public.current_role(),'') not in ('admin','guru','murid') then raise exception 'Silakan masuk terlebih dahulu.'; end if;
  return (select jsonb_build_object('id',v.id,'data',v.data) from public.learning_versions v join public.learning_current c on c.revision=v.id where c.id=1);
end; $$;

create or replace function public.validate_learning_item(kind text,item jsonb) returns void
language plpgsql set search_path='' as $$
declare field text; required_fields text[]; img text;
begin
  if item is null or jsonb_typeof(item)<>'object' or octet_length(item::text)>50000 then raise exception 'Isi konten tidak valid atau terlalu panjang.'; end if;
  required_fields:=case kind
    when 'questions' then array['q']
    when 'essays' then array['q']
    when 'materials' then array['title','body']
    when 'ads' then array['title','icon','line','type','reason']
    when 'puzzles' then array['title','image','type','reason','aim','wrongAim','thirdQuestion','thirdCorrect','thirdWrong','thirdExplanation']
    else null end;
  if required_fields is null then raise exception 'Kategori tidak valid.'; end if;
  foreach field in array required_fields loop
    if jsonb_typeof(item->field) is distinct from 'string' or length(trim(item->>field))=0 or length(item->>field)>(case when field='body' then 20000 else 4000 end) then
      raise exception 'Lengkapi kolom % (maksimal % karakter).',field,(case when field='body' then 20000 else 4000 end);
    end if;
  end loop;
  if kind in ('ads','puzzles') and item->>'type' not in ('komersial','nonkomersial') then raise exception 'Jenis iklan tidak valid.'; end if;
  if kind='questions' then
    if jsonb_typeof(item->'o') is distinct from 'array' then raise exception 'Isi empat pilihan jawaban.'; end if;
    if jsonb_array_length(item->'o')<>4 or exists(select 1 from jsonb_array_elements(item->'o') x where jsonb_typeof(x)<>'string' or length(trim(x#>>'{}'))=0 or length(x#>>'{}')>4000) then raise exception 'Isi empat pilihan jawaban.'; end if;
    if not coalesce(item->'a' in ('0'::jsonb,'1'::jsonb,'2'::jsonb,'3'::jsonb),false) then raise exception 'Pilih jawaban benar.'; end if;
  end if;
  foreach field in array array['explanation','guidance'] loop
    if item ? field and (jsonb_typeof(item->field)<>'string' or length(item->>field)>4000) then raise exception 'Petunjuk/pembahasan tidak valid.'; end if;
  end loop;
  if kind in ('materials','puzzles') then
    img:=coalesce(item->>'image','');
    if length(img)>2000 or (img<>'' and img !~ '^(https://[A-Za-z0-9][A-Za-z0-9./_%?=&#:+~-]*|/?[A-Za-z0-9][A-Za-z0-9._/-]*)$') then raise exception 'Gunakan URL gambar HTTPS yang valid.'; end if;
  end if;
end; $$;

create or replace function public.save_learning_item(content_kind text,item_index integer,item_data jsonb,expected_revision uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare current_id uuid; new_id uuid; bank jsonb; items jsonb;
begin
  if coalesce(public.current_role(),'') not in ('admin','guru') then raise exception 'Hanya admin dan guru dapat mengubah konten.'; end if;
  perform public.validate_learning_item(content_kind,item_data);
  select revision into current_id from public.learning_current where id=1 for update;
  if current_id is null then raise exception 'Bank konten belum dipasang.'; end if;
  if current_id is distinct from expected_revision then raise exception 'Konten sudah diubah pengajar lain. Salin perubahan Anda, tutup formulir, lalu klik Muat ulang sebelum mengedit kembali.'; end if;
  select data into bank from public.learning_versions where id=current_id;
  items:=bank->content_kind;
  if item_index is null then
    if jsonb_array_length(items)>=1000 then raise exception 'Maksimal 1000 konten per kategori.'; end if;
    items:=items||jsonb_build_array(item_data);
  else
    if item_index<0 or item_index>=jsonb_array_length(items) then raise exception 'Konten tidak ditemukan.'; end if;
    items:=jsonb_set(items,array[item_index::text],item_data,false);
  end if;
  bank:=jsonb_set(bank,array[content_kind],items,false);
  insert into public.learning_versions(data,edited_by) values(bank,auth.uid()) returning id into new_id;
  update public.learning_current set revision=new_id where id=1;
  return jsonb_build_object('id',new_id,'data',bank);
end; $$;

create or replace function public.delete_learning_item(content_kind text,item_index integer,expected_revision uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare current_id uuid; new_id uuid; bank jsonb; items jsonb;
begin
  if coalesce(public.current_role(),'') not in ('admin','guru') then raise exception 'Hanya admin dan guru dapat menghapus konten.'; end if;
  if content_kind is null or content_kind not in ('questions','essays','ads','materials','puzzles') then raise exception 'Kategori tidak valid.'; end if;
  select revision into current_id from public.learning_current where id=1 for update;
  if current_id is null then raise exception 'Bank konten belum dipasang.'; end if;
  if current_id is distinct from expected_revision then raise exception 'Konten sudah diubah pengajar lain. Tutup konfirmasi dan klik Muat ulang sebelum menghapus.'; end if;
  select data into bank from public.learning_versions where id=current_id;
  items:=bank->content_kind;
  if item_index is null or item_index<0 or item_index>=jsonb_array_length(items) then raise exception 'Konten tidak ditemukan.'; end if;
  if content_kind in ('questions','materials','puzzles','ads') and jsonb_array_length(items)<=1 then raise exception 'Sisakan minimal satu konten untuk kategori ini.'; end if;
  items:=items-item_index;
  bank:=jsonb_set(bank,array[content_kind],items,false);
  insert into public.learning_versions(data,edited_by) values(bank,auth.uid()) returning id into new_id;
  update public.learning_current set revision=new_id where id=1;
  return jsonb_build_object('id',new_id,'data',bank);
end; $$;
revoke all on function public.delete_learning_item(text,integer,uuid) from public,anon;
grant execute on function public.delete_learning_item(text,integer,uuid) to authenticated;

create or replace function public.save_learning_settings(ad_count integer,expected_revision uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare current_id uuid; new_id uuid; bank jsonb;
begin
  if coalesce(public.current_role(),'') not in ('admin','guru') then raise exception 'Hanya admin dan guru dapat mengatur permainan.'; end if;
  if ad_count is null or ad_count<1 or ad_count>1000 then raise exception 'Jumlah kartu harus 1 sampai 1000.'; end if;
  select revision into current_id from public.learning_current where id=1 for update;
  if current_id is null then raise exception 'Bank konten belum dipasang.'; end if;
  if current_id is distinct from expected_revision then raise exception 'Konten sudah diubah pengajar lain. Klik Muat ulang sebelum menyimpan.'; end if;
  select data into bank from public.learning_versions where id=current_id;
  bank:=jsonb_set(bank,'{settings}',jsonb_build_object('adCount',ad_count),true);
  insert into public.learning_versions(data,edited_by) values(bank,auth.uid()) returning id into new_id;
  update public.learning_current set revision=new_id where id=1;
  return jsonb_build_object('id',new_id,'data',bank);
end; $$;
revoke all on function public.save_learning_settings(integer,uuid) from public,anon;
grant execute on function public.save_learning_settings(integer,uuid) to authenticated;

create or replace function public.record_content_attempt(event_id uuid,activity text,correct_count integer,total_count integer,submitted_answers jsonb,content_revision uuid) returns void
language plpgsql security definer set search_path='' as $$
declare bank jsonb; count_items integer;
begin
  if public.current_role() is distinct from 'murid' then raise exception 'Hanya murid dapat menyimpan hasil.'; end if;
  select data into bank from public.learning_versions where id=content_revision;
  if bank is null then raise exception 'Versi konten tidak ditemukan. Masuk kembali untuk memuat konten.'; end if;
  if activity is null or activity not in ('soal','materi','game','puzzle') then raise exception 'Kegiatan tidak valid.'; end if;
  if activity='soal' then
    count_items:=jsonb_array_length(bank->'questions');
    if submitted_answers is null or jsonb_typeof(submitted_answers)<>'array' then raise exception 'Jawaban tidak valid.'; end if;
    if jsonb_array_length(submitted_answers)<>count_items or exists(select 1 from jsonb_array_elements(submitted_answers) x where x not in ('0'::jsonb,'1'::jsonb,'2'::jsonb,'3'::jsonb)) then raise exception 'Jawaban belum lengkap.'; end if;
    select count(*) into correct_count from jsonb_array_elements(submitted_answers) with ordinality x(value,n) where x.value=bank->'questions'->(x.n::int-1)->'a';
    total_count:=count_items;
  end if;
  if correct_count is null or total_count is null or total_count<1 or total_count>1000 or correct_count<0 or correct_count>total_count then raise exception 'Hasil tidak valid.'; end if;
  if activity='materi' and (total_count<>jsonb_array_length(bank->'materials') or correct_count<>total_count) then raise exception 'Materi belum lengkap.'; end if;
  if activity='game' and total_count<>least(coalesce((bank->'settings'->>'adCount')::int,20),jsonb_array_length(bank->'ads')) then raise exception 'Selesaikan semua kartu sesuai pengaturan permainan.'; end if;
  if activity='puzzle' and total_count<>3 then raise exception 'Selesaikan tiga pertanyaan analisis.'; end if;
  insert into public.attempts(id,student_id,activity,correct,total) values(event_id,auth.uid(),activity,correct_count,total_count) on conflict(id) do nothing;
end; $$;

create or replace function public.submit_learning_essay(event_id uuid,content_revision uuid,responses jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare bank jsonb; canonical jsonb;
begin
  if public.current_role() is distinct from 'murid' then raise exception 'Hanya murid dapat mengirim jawaban.'; end if;
  select data into bank from public.learning_versions where id=content_revision;
  if bank is null then raise exception 'Versi konten tidak ditemukan.'; end if;
  if responses is null or jsonb_typeof(responses)<>'array' then raise exception 'Jawaban tidak valid.'; end if;
  if jsonb_array_length(responses)=0 or jsonb_array_length(responses)<>jsonb_array_length(bank->'essays') then raise exception 'Lengkapi semua jawaban esai.'; end if;
  if exists(select 1 from jsonb_array_elements(responses) x where jsonb_typeof(x->'answer') is distinct from 'string' or length(trim(x->>'answer'))=0 or length(x->>'answer')>10000) then raise exception 'Jawaban harus berisi 1–10000 karakter.'; end if;
  select jsonb_agg(jsonb_build_object('q',bank->'essays'->(x.n::int-1)->>'q','answer',trim(x.value->>'answer')) order by x.n) into canonical from jsonb_array_elements(responses) with ordinality x(value,n);
  insert into public.essay_submissions(id,student_id,revision,answers) values(event_id,auth.uid(),content_revision,canonical) on conflict(id) do nothing;
end; $$;

revoke all on function public.get_learning_content(),public.validate_learning_item(text,jsonb),public.save_learning_item(text,integer,jsonb,uuid),public.record_content_attempt(uuid,text,integer,integer,jsonb,uuid),public.submit_learning_essay(uuid,uuid,jsonb) from public,anon;
grant execute on function public.get_learning_content(),public.save_learning_item(text,integer,jsonb,uuid),public.record_content_attempt(uuid,text,integer,integer,jsonb,uuid),public.submit_learning_essay(uuid,uuid,jsonb) to authenticated;

-- Storage tersedia di Supabase; blok ini dilewati hanya pada pengujian PostgreSQL lokal.
do $$ begin
  if to_regclass('storage.buckets') is not null then
    insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
      values('learning-images','learning-images',true,5242880,array['image/jpeg','image/png','image/webp'])
      on conflict(id) do update set public=true,file_size_limit=5242880,allowed_mime_types=array['image/jpeg','image/png','image/webp'];
    execute 'drop policy if exists learning_images_insert on storage.objects';
    execute 'create policy learning_images_insert on storage.objects for insert to authenticated with check (bucket_id=''learning-images'' and public.current_role() in (''admin'',''guru''))';
  end if;
end $$;
-- INITIAL_CONTENT
notify pgrst, 'reload schema';
commit;
