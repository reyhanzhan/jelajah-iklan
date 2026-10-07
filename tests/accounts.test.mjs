import {test} from 'node:test';
import assert from 'node:assert/strict';
import {transform} from 'esbuild';
import fs from 'node:fs/promises';
const source=await fs.readFile('supabase/functions/create-account/index.ts','utf8');
const compiled=await transform(source.replace("import { createClient } from 'npm:@supabase/supabase-js@2';",''),{loader:'ts',target:'es2022'});

function setup(role,owner='caller',membershipError=false){
  const calls={created:0,deleted:0,updated:0};let handler;
  const client={
    auth:{getUser:async()=>({data:{user:{id:'caller'}},error:null}),admin:{
      createUser:async()=>{calls.created++;return {data:{user:{id:'new-student'}},error:null};},
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
test('guru membuat murid sendiri, admin membuat guru, password pendek ditolak',async()=>{
  const teacher=setup('guru');assert.equal((await teacher.run(student)).status,200);assert.equal(teacher.calls.created,1);
  const admin=setup('admin');assert.equal((await admin.run({...student,role:'guru'})).status,200);assert.equal(admin.calls.updated,1);
  assert.equal((await admin.run({...student,password:'123'})).status,400);
});
test('akun baru dibatalkan saat keanggotaan kelas gagal disimpan',async()=>{
  const {run,calls}=setup('guru','caller',true);assert.equal((await run(student)).status,500);assert.equal(calls.deleted,1);
});
