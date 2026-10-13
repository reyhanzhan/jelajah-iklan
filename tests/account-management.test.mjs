import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {transform} from 'esbuild';
import {PGlite} from '@electric-sql/pglite';

const ids={admin:'00000000-0000-4000-8000-000000000001',guru:'00000000-0000-4000-8000-000000000002',other:'00000000-0000-4000-8000-000000000003',murid:'00000000-0000-4000-8000-000000000004'};
const classId='00000000-0000-4000-8000-000000000011';
const pg=new PGlite();
before(async()=>{
  await pg.exec(`create role anon;create role authenticated;create role service_role bypassrls;
    create schema auth;create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb default '{}',raw_app_meta_data jsonb default '{}');
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    grant usage on schema auth,public to anon,authenticated,service_role;`);
  for(const [name,id] of Object.entries(ids))await pg.query('insert into auth.users(id,email) values($1,$2)',[id,name+'@school.test']);
  await pg.exec(await fs.readFile('supabase/schema.sql','utf8'));
  for(const name of ['admin','guru','other'])await pg.query('update profiles set role=$1 where id=$2',[name==='other'?'guru':name,ids[name]]);
  await pg.query('insert into classes(id,name,teacher_id) values($1,$2,$3)',[classId,'Kelas A',ids.guru]);
  await pg.query('insert into memberships values($1,$2)',[classId,ids.murid]);
  for(let i=0;i<2;i++)await pg.exec(await fs.readFile('supabase/account-management.sql','utf8'));
});
after(()=>pg.close());
async function as(name,callback){
  await pg.query("select set_config('request.jwt.claim.sub',$1,false)",[ids[name]]);await pg.exec('set role authenticated');
  try{return await callback();}finally{await pg.exec('reset role');}
}
test('email tersinkron, trigger akun baru bekerja dan RLS melindungi email',async()=>{
  await as('murid',async()=>assert.deepEqual((await pg.query('select email from profiles')).rows,[{email:'murid@school.test'}]));
  const id='00000000-0000-4000-8000-000000000055';
  await pg.query(`insert into auth.users(id,email,raw_app_meta_data,raw_user_meta_data) values($1,'new@school.test','{"provisioned":true}','{"full_name":"Baru"}')`,[id]);
  assert.equal((await pg.query('select email from profiles where id=$1',[id])).rows[0].email,'new@school.test');
  await pg.query(`update auth.users set email='edit@school.test',raw_user_meta_data='{"full_name":"Edit","role":"admin"}' where id=$1`,[id]);
  assert.deepEqual((await pg.query('select email,full_name,role from profiles where id=$1',[id])).rows,[{email:'edit@school.test',full_name:'Edit',role:'murid'}]);
});
test('edit/hapus kelas menolak murid dan guru lain; admin bisa pindah pengajar; akun/nilai bertahan',async()=>{
  for(const name of ['murid','other'])await as(name,async()=>{
    await assert.rejects(pg.query("select manage_class('update',$1,'Palsu')",[classId]));
    await assert.rejects(pg.query("select manage_class('delete',$1)",[classId]));
  });
  await as('guru',async()=>{
    await pg.query("select manage_class('update',$1,'Kelas Baru')",[classId]);
    await assert.rejects(pg.query("select manage_class('update',$1,'')",[classId]));
    await assert.rejects(pg.query("select manage_class('update',$1,'Kelas',$2)",[classId,ids.other]));
  });
  await pg.query("insert into attempts values(gen_random_uuid(),$1,'game',1,2,now())",[ids.murid]);
  await as('admin',()=>pg.query("select manage_class('update',$1,'Pindah',$2)",[classId,ids.other]));
  await as('other',()=>pg.query("select manage_class('delete',$1)",[classId]));
  assert.equal((await pg.query('select * from memberships')).rows.length,0);
  assert.equal((await pg.query('select * from profiles where id=$1',[ids.murid])).rows.length,1);
  assert.equal((await pg.query('select * from attempts')).rows.length,1);
});

const source=(await fs.readFile('supabase/functions/create-account/index.ts','utf8')).replace("import { createClient } from 'npm:@supabase/supabase-js@2';",'');
const compiled=await transform(source,{loader:'ts'});
function edge({role='admin',targetRole='murid',owners=[ids.guru],classes=[],failure=null,authError=false}={}){
  const calls={updates:[],deletes:[]};let handler;
  const client={auth:{getUser:async()=>({data:{user:authError?null:{id:ids[role]}},error:authError}),admin:{
    updateUserById:async(id,values)=>{calls.updates.push(values);return {error:failure};},
    deleteUser:async id=>{calls.deletes.push(id);return {error:failure};}
  }},from(table){
    return {select(){
      return {eq(column,id){
        if(table==='profiles')return {single:async()=>({data:id===ids[role]?{id,role}:{id,role:targetRole,email:'student@school.test'}})};
        return Promise.resolve({data:table==='classes'?classes:owners.map(teacher_id=>({classes:{teacher_id}}))});
      }};
    }};
  }};
  new Function('Deno','createClient',compiled.code)({env:{get:()=>''},serve:fn=>handler=fn},()=>client);
  return {calls,run:body=>handler(new Request('https://test/create-account',{method:'POST',headers:{Authorization:'Bearer test'},body:JSON.stringify(body)}))};
}
const edit={action:'update',id:ids.murid,full_name:'Nama baru',email:'baru@school.test',password:''};
test('edit/hapus akun memeriksa role, kelas, sesi dan akun admin',async()=>{
  for(const config of [{role:'murid'},{role:'guru',owners:[ids.other]},{role:'guru',targetRole:'guru'},{role:'guru',owners:[ids.guru,ids.other]},{authError:true}]){
    const service=edge(config);
    for(const action of ['update','delete'])assert([401,403].includes((await service.run({...edit,action})).status));
    assert.equal(service.calls.updates.length+service.calls.deletes.length,0);
  }
  assert.equal((await edge().run({action:'delete',id:ids.admin})).status,403);
  assert.equal((await edge({targetRole:'admin'}).run({action:'delete',id:ids.other})).status,403);
  assert.equal((await edge({targetRole:'guru',classes:[{id:classId}]}).run({action:'delete',id:ids.guru})).status,409);
});
test('edit nama/email, sandi opsional, hapus akun dan error Auth',async()=>{
  for(const role of ['admin','guru']){
    const service=edge({role});assert.equal((await service.run(edit)).status,200);
    assert.equal(service.calls.updates[0].password,undefined);
    assert.deepEqual(service.calls.updates[0].user_metadata,{full_name:'Nama baru'});
    assert.equal((await service.run({...edit,password:'123456'})).status,200);
    assert.equal(service.calls.updates[1].password,'123456');
    assert.equal((await service.run({action:'delete',id:ids.murid})).status,200);
  }
  const invalid=edge();assert.equal((await invalid.run({...edit,email:'bad'})).status,400);assert.equal(invalid.calls.updates.length,0);
  const duplicate=await edge({failure:{code:'email_exists',message:'Exists'}}).run(edit);
  assert.equal(duplicate.status,409);
  assert.equal((await edge({failure:{message:'Failed'}}).run({action:'delete',id:ids.murid})).status,400);
});
