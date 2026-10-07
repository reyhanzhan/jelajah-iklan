import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const pg = new PGlite();
const ids = {admin:'00000000-0000-4000-8000-000000000001',guru:'00000000-0000-4000-8000-000000000002',otherGuru:'00000000-0000-4000-8000-000000000003',murid:'00000000-0000-4000-8000-000000000004',otherMurid:'00000000-0000-4000-8000-000000000005'};
const c1='00000000-0000-4000-8000-000000000011',c2='00000000-0000-4000-8000-000000000012';
before(async()=>{
  await pg.exec(`create role anon;create role authenticated;create role service_role bypassrls;
    create schema auth;
    create table auth.users(id uuid primary key,raw_user_meta_data jsonb default '{}',raw_app_meta_data jsonb default '{}');
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    grant usage on schema auth,public to anon,authenticated,service_role;
    grant execute on function auth.uid() to authenticated;
  `);
  for(const [name,id] of Object.entries(ids))await pg.query('insert into auth.users(id,raw_user_meta_data) values($1,$2)',[id,JSON.stringify({full_name:name})]);
  await pg.exec(await fs.readFile('supabase/schema.sql','utf8'));
  await pg.exec(await fs.readFile('supabase/seed.sql','utf8'));
  await pg.query("update public.profiles set role='admin' where id=$1",[ids.admin]);
  await pg.query("update public.profiles set role='guru' where id in ($1,$2)",[ids.guru,ids.otherGuru]);
  await pg.query('insert into public.classes(id,name,teacher_id) values($1,$2,$3),($4,$5,$6)',[c1,'Kelas A',ids.guru,c2,'Kelas B',ids.otherGuru]);
  await pg.query('insert into public.memberships values($1,$2),($3,$4)',[c1,ids.murid,c2,ids.otherMurid]);
});
after(()=>pg.close());
async function as(name,callback){
  await pg.query("select set_config('request.jwt.claim.sub',$1,false)",[ids[name]||'']);
  await pg.exec('set role authenticated');
  try{return await callback();}finally{await pg.exec('reset role');}
}
test('murid hanya dapat membaca profil dan kelas sendiri',async()=>as('murid',async()=>{
  assert.deepEqual((await pg.query('select id from profiles')).rows.map(r=>r.id),[ids.murid]);
  assert.deepEqual((await pg.query('select id from classes')).rows.map(r=>r.id),[c1]);
  assert.equal((await pg.query('select * from memberships')).rows.length,1);
}));
test('guru hanya dapat melihat murid dan kelasnya sendiri',async()=>as('guru',async()=>{
  const profiles=(await pg.query('select id from profiles')).rows.map(r=>r.id);
  assert(profiles.includes(ids.murid));assert(!profiles.includes(ids.otherMurid));assert(!profiles.includes(ids.admin));
  assert.deepEqual((await pg.query('select id from classes')).rows.map(r=>r.id),[c1]);
  await assert.rejects(pg.query('insert into classes(name,teacher_id) values($1,$2)',['Palsu',ids.otherGuru]));
}));
test('murid tidak dapat mengubah role, membuat kelas, atau menulis nilai langsung',async()=>as('murid',async()=>{
  await assert.rejects(pg.query("update profiles set role='admin' where id=$1",[ids.murid]));
  await assert.rejects(pg.query("select set_user_role($1,'admin')",[ids.murid]));
  await assert.rejects(pg.query('insert into classes(name,teacher_id) values($1,$2)',['Kelas palsu',ids.murid]));
  await assert.rejects(pg.query("insert into attempts values(gen_random_uuid(),$1,'soal',25,25,now())",[ids.murid]));
  await assert.rejects(pg.query('select * from quiz_keys'));
}));
test('nilai soal dihitung server, retry idempotent, laporan terisolasi',async()=>{
  const key=(await pg.query('select answers from quiz_keys where id=1')).rows[0].answers;
  const event='00000000-0000-4000-8000-000000000021';
  await as('murid',async()=>{
    // Browser mengirim nilai palsu; server menggunakan jawaban, bukan angka itu.
    await pg.query("select record_attempt($1,'soal',999,999,$2)",[event,JSON.stringify(key)]);
    await pg.query("select record_attempt($1,'soal',0,1,$2)",[event,JSON.stringify(key)]);
    const rows=(await pg.query('select correct,total from attempts')).rows;
    assert.deepEqual(rows,[{correct:25,total:25}]);
    await assert.rejects(pg.query("select record_attempt(gen_random_uuid(),'soal',25,25,'[0]')"));
    await assert.rejects(pg.query("select record_attempt(gen_random_uuid(),'soal',25,25,$1)",[JSON.stringify(Array(25).fill(null))]));
  });
  await as('otherMurid',async()=>assert.equal((await pg.query('select * from attempts')).rows.length,0));
  await as('otherGuru',async()=>assert.equal((await pg.query('select * from attempts')).rows.length,0));
  await as('guru',async()=>assert.equal((await pg.query('select * from attempts')).rows.length,1));
});
test('hanya admin mengubah role; akun sendiri dan guru aktif dilindungi',async()=>{
  await as('guru',async()=>await assert.rejects(pg.query("select set_user_role($1,'guru')",[ids.murid])));
  await as('admin',async()=>{
    await assert.rejects(pg.query("select set_user_role($1,'murid')",[ids.admin]));
    await assert.rejects(pg.query("select set_user_role($1,'murid')",[ids.guru]));
    await pg.query("select set_user_role($1,'guru')",[ids.otherMurid]);
    assert.equal((await pg.query('select role from profiles where id=$1',[ids.otherMurid])).rows[0].role,'guru');
    assert.equal((await pg.query('select * from memberships where student_id=$1',[ids.otherMurid])).rows.length,0);
  });
});
test('signup publik diblokir dan metadata pengguna tidak bisa menaikkan role',async()=>{
  await assert.rejects(pg.query("insert into auth.users(id,raw_user_meta_data) values(gen_random_uuid(),'{\"role\":\"admin\"}')"));
  const id='00000000-0000-4000-8000-000000000031';
  await pg.query("insert into auth.users(id,raw_user_meta_data,raw_app_meta_data) values($1,'{\"full_name\":\"Akun Baru\",\"role\":\"admin\"}','{\"provisioned\":true}')",[id]);
  assert.equal((await pg.query('select role from profiles where id=$1',[id])).rows[0].role,'murid');
});
