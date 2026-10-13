import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';

test('upgrade memperbaiki urutan Auth Admin API tanpa membuka signup publik atau mengubah akun lama',async()=>{
  const pg=new PGlite();
  const oldId='00000000-0000-4000-8000-000000000001';
  const newId='00000000-0000-4000-8000-000000000002';
  const rejectedId='00000000-0000-4000-8000-000000000003';
  try{
    await pg.exec(`create role anon;create role authenticated;create role service_role bypassrls;
      create schema auth;
      create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb default '{}',raw_app_meta_data jsonb default '{}');
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      grant usage on schema auth,public to anon,authenticated,service_role;`);
    await pg.query("insert into auth.users(id,email) values($1,'admin@test.school')",[oldId]);
    await pg.exec(await fs.readFile('supabase/schema.sql','utf8'));
    await pg.exec(await fs.readFile('supabase/account-management.sql','utf8'));
    await pg.query("update profiles set role='admin',full_name='Admin Lama' where id=$1",[oldId]);
    // Reproduksi trigger lama yang gagal sebelum Auth sempat mengisi app_metadata.
    await pg.exec(`drop trigger on_auth_user_provisioned on auth.users;
      create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path='' as $$
      begin
        if coalesce(new.raw_app_meta_data->>'provisioned','false')<>'true' then raise exception 'Akun hanya dapat dibuat oleh admin atau guru.'; end if;
        insert into public.profiles(id,full_name,role) values(new.id,'Murid','murid');
        return new;
      end; $$;`);
    await pg.exec('begin');
    await assert.rejects(pg.query("insert into auth.users(id,email,raw_user_meta_data) values($1,'murid@test.school','{\"full_name\":\"Murid Baru\"}')",[newId]),/Akun hanya/);
    await pg.exec('rollback');

    const migration=await fs.readFile('supabase/fix-account-creation.sql','utf8');
    await pg.exec(migration);await pg.exec(migration);
    // Urutan yang sama dengan adminUserCreate: INSERT lalu UPDATE app_metadata, COMMIT.
    await pg.exec('begin');
    await pg.query("insert into auth.users(id,email,raw_user_meta_data) values($1,'murid@test.school','{\"full_name\":\"Murid Baru\",\"role\":\"admin\"}')",[newId]);
    await pg.query("update auth.users set raw_app_meta_data='{\"provider\":\"email\",\"provisioned\":true}' where id=$1",[newId]);
    await pg.exec('commit');
    assert.deepEqual((await pg.query('select full_name,role,email from profiles where id=$1',[newId])).rows,[{full_name:'Murid Baru',role:'murid',email:'murid@test.school'}]);
    assert.deepEqual((await pg.query('select full_name,role from profiles where id=$1',[oldId])).rows,[{full_name:'Admin Lama',role:'admin'}]);

    // Metadata yang dapat diisi pengguna tidak memenuhi penanda provisioning server.
    await pg.exec('begin');
    await pg.query("insert into auth.users(id,email,raw_user_meta_data) values($1,'palsu@test.school','{\"provisioned\":true,\"role\":\"admin\"}')",[rejectedId]);
    await assert.rejects(pg.exec('commit'),/Akun hanya/);
    await pg.exec('rollback');
    assert.equal((await pg.query('select id from auth.users where id=$1',[rejectedId])).rows.length,0);
    assert.equal((await pg.query('select id from profiles where id=$1',[rejectedId])).rows.length,0);
  }finally{await pg.close();}
});
