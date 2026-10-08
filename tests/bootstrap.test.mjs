import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {pgcrypto} from '@electric-sql/pglite/contrib/pgcrypto';

const template=await fs.readFile('supabase/create-initial-accounts.sql','utf8');
const passwords={admin:'TestingAdminSecret',guru:'TestingTeacherSecret',siswa:'TestingStudentSecret'};
const sql=template.replace('REPLACE_ADMIN_PASSWORD',passwords.admin).replace('REPLACE_GURU_PASSWORD',passwords.guru).replace('REPLACE_SISWA_PASSWORD',passwords.siswa);
async function database(){
  const pg=new PGlite({extensions:{pgcrypto}});
  await pg.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth;
    create table auth.users(id uuid primary key,instance_id uuid,aud text,role text,email text unique,encrypted_password text,email_confirmed_at timestamptz,
      raw_app_meta_data jsonb,raw_user_meta_data jsonb,created_at timestamptz,updated_at timestamptz,
      confirmation_token text,recovery_token text,email_change_token_new text,email_change text,email_change_token_current text,reauthentication_token text,
      phone_change text,phone_change_token text,email_change_confirm_status integer,is_super_admin boolean,is_sso_user boolean,is_anonymous boolean);
    create table auth.identities(id uuid primary key,user_id uuid references auth.users(id),provider_id text not null,provider text not null,identity_data jsonb,created_at timestamptz,updated_at timestamptz,unique(provider_id,provider));
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    grant usage on schema public,auth to anon,authenticated,service_role;`);
  await pg.exec(await fs.readFile('supabase/schema.sql','utf8'));
  return pg;
}
test('query akun awal membuat 3 akun, bcrypt benar, identitas email, role dan kelas; pengulangan tidak mengganti sandi',async()=>{
  const pg=await database();
  try{
    await pg.exec(sql);
    assert.deepEqual((await pg.query('select role from public.profiles order by role')).rows.map(r=>r.role),['admin','guru','murid']);
    assert.equal((await pg.query('select * from auth.identities')).rows.length,3);
    assert.equal((await pg.query('select * from public.memberships')).rows.length,1);
    for(const [name,password] of Object.entries(passwords)){
      const r=await pg.query('select encrypted_password = extensions.crypt($1,encrypted_password) as valid, email_confirmed_at is not null as confirmed from auth.users where email=$2',[password,`${name}@jelajah-iklan.test`]);
      assert.deepEqual(r.rows,[{valid:true,confirmed:true}]);
    }
    const first=(await pg.query('select encrypted_password from auth.users order by email')).rows;
    await pg.exec(sql);
    assert.deepEqual((await pg.query('select encrypted_password from auth.users order by email')).rows,first);
    assert.equal((await pg.query('select * from public.classes')).rows.length,1);
    assert.equal((await pg.query('select * from public.memberships')).rows.length,1);
  }finally{await pg.close();}
});
test('template yang belum diisi berhenti tanpa membuat akun',async()=>{
  const pg=await database();
  try{await assert.rejects(pg.exec(template),/Isi sandi/);await pg.exec('rollback');assert.equal((await pg.query('select * from auth.users')).rows.length,0);}finally{await pg.close();}
});
