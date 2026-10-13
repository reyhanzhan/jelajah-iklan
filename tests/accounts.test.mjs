import {test} from 'node:test';
import assert from 'node:assert/strict';
import {transform} from 'esbuild';
import fs from 'node:fs/promises';
const source=await fs.readFile('supabase/functions/create-account/index.ts','utf8');
const compiled=await transform(source.replace("import { createClient } from 'npm:@supabase/supabase-js@2';",''),{loader:'ts',target:'es2022'});

function setup(role,owner='caller',membershipError=false,createError=null,authError=null){
  const calls={created:0,deleted:0,updated:0};let handler;
  const client={
    auth:{getUser:async()=>({data:{user:authError?null:{id:'caller'}},error:authError}),admin:{
      createUser:async()=>{calls.created++;return {data:{user:createError?null:{id:'new-student'}},error:createError};},
      deleteUser:async()=>{calls.deleted++;return {error:null};}
    }},
    from(table){return {
      select(){return {eq(){return {single:async()=>({data:table==='profiles'?{role}:{teacher_id:owner}})};}};},
      update(){return {eq:async()=>{calls.updated++;return {error:null};}};},
      insert:async()=>({error:membershipError?new Error('Failed'):null})
    };}
  };
  new Function('Deno','createClient',compiled.code)({env:{get:name=>name==='SUPABASE_SECRET_KEYS'?'{}':'test-only'},serve:fn=>{handler=fn;}},()=>client);
  return {calls,run:values=>handler(new Request('https://example.test/create-account',{method:'POST',headers:{Authorization:'Bearer test-only','Content-Type':'application/json'},body:JSON.stringify(values)}))};
}
const student={full_name:'Murid Uji',email:'murid@example.test',password:'Test-only-123',role:'murid',class_id:'class-test'};
test('fungsi akun menolak murid, kelas guru lain, dan pembuatan guru oleh guru',async()=>{
  for(const [role,owner,payload] of [['murid','caller',student],['guru','other-teacher',student],['guru','caller',{...student,role:'guru'}]]){
    const {run,calls}=setup(role,owner);const response=await run(payload);
    assert.equal(response.status,403);assert.equal(calls.created,0);
  }
});
test('guru membuat murid sendiri, admin membuat guru, panjang sandi mengikuti Supabase',async()=>{
  const teacher=setup('guru');assert.equal((await teacher.run(student)).status,200);assert.equal(teacher.calls.created,1);
  const admin=setup('admin');assert.equal((await admin.run({...student,role:'guru'})).status,200);assert.equal(admin.calls.updated,1);
  assert.equal((await admin.run({...student,password:'123456'})).status,200);
  assert.equal((await admin.run({...student,password:'123'})).status,200);
  assert.equal((await admin.run({...student,password:''})).status,400);
});

test('sesi tidak sah ditolak dan error email/sandi dijelaskan',async()=>{
  const invalid=setup('admin','caller',false,null,new Error('Invalid JWT'));
  assert.equal((await invalid.run(student)).status,401);assert.equal(invalid.calls.created,0);
  const duplicate=setup('admin','caller',false,{code:'email_exists',message:'Email exists'});
  const response=await duplicate.run(student);assert.equal(response.status,409);assert.match((await response.json()).error,/Email ini sudah digunakan/);
  const weak=setup('admin','caller',false,{code:'weak_password',message:'Password should be at least 6 characters.'});
  assert.match((await(await weak.run({...student,password:'123'})).json()).error,/minimal 6 karakter/);
});
test('akun baru dibatalkan saat keanggotaan kelas gagal disimpan',async()=>{
  const {run,calls}=setup('guru','caller',true);assert.equal((await run(student)).status,500);assert.equal(calls.deleted,1);
});
