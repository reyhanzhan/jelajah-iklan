import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
const pg=new PGlite();
const ids={admin:'00000000-0000-4000-8000-000000000001',guru:'00000000-0000-4000-8000-000000000002',murid:'00000000-0000-4000-8000-000000000003',other:'00000000-0000-4000-8000-000000000004'};
let first;
const migration=await fs.readFile('supabase/content-management.sql','utf8');
before(async()=>{
  await pg.exec(`create role anon;create role authenticated;create role service_role bypassrls;
    create schema auth;create table auth.users(id uuid primary key,raw_user_meta_data jsonb default '{}',raw_app_meta_data jsonb default '{}');
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    grant usage on schema auth,public to authenticated,anon;grant execute on function auth.uid() to authenticated;
    create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    create table storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text);alter table storage.objects enable row level security;
    grant usage on schema storage to authenticated;grant insert on storage.objects to authenticated;`);
  for(const id of Object.values(ids))await pg.query('insert into auth.users(id) values($1)',[id]);
  await pg.exec(await fs.readFile('supabase/schema.sql','utf8'));
  await pg.exec(await fs.readFile('supabase/seed.sql','utf8'));
  for(const role of ['admin','guru'])await pg.query('update profiles set role=$1 where id=$2',[role,ids[role]]);
  await pg.exec(migration);
  first=(await pg.query('select revision from learning_current')).rows[0].revision;
});
after(()=>pg.close());
async function as(role,fn){
  await pg.query("select set_config('request.jwt.claim.sub',$1,false)",[ids[role]||'']);
  await pg.exec('set role '+(role==='anon'?'anon':'authenticated'));
  try{return await fn();}finally{await pg.exec('reset role');}
}
const read=async()=> (await pg.query('select get_learning_content() as bank')).rows[0].bank;
const save=async(kind,index,item,revision)=>(await pg.query('select save_learning_item($1,$2,$3,$4) as bank',[kind,index,JSON.stringify(item),revision])).rows[0].bank;

test('bank content is authenticated, only teachers/admin edit and upload',async()=>{
  await as('anon',()=>assert.rejects(read()));
  await as('murid',async()=>{
    const bank=await read();assert.equal(bank.data.questions.length,25);
    await assert.rejects(save('essays',null,{q:'Test'},bank.id),/Hanya admin dan guru/);
    await assert.rejects(pg.query('update learning_versions set data=\'{}\''));
    await assert.rejects(pg.query("insert into storage.objects(bucket_id,name) values('learning-images','a.jpg')"));
  });
  for(const role of ['admin','guru'])await as(role,()=>pg.query("insert into storage.objects(bucket_id,name) values('learning-images','a.jpg')"));
});
test('staff edit every content type, stale saves and malformed content are rejected',async()=>as('guru',async()=>{
  let bank=await read();
  for(const kind of ['questions','ads','materials','puzzles']){
    const item={...bank.data[kind][0]};
    if(kind==='questions')item.q='Pertanyaan diperbarui';else item.title='Judul diperbarui';
    bank=await save(kind,0,item,bank.id);
  }
  bank=await save('essays',null,{q:'Buat iklan komersial.',guidance:'Gunakan kalimat persuasif.'},bank.id);
  await assert.rejects(save('essays',null,{q:'stale'},first),/pengajar lain/);
  await assert.rejects(save('questions',0,{q:'test',o:['A'],a:7},bank.id),/empat pilihan/);
  await assert.rejects(save('materials',0,{title:'x',body:'y',image:'javascript:alert(1)'},bank.id),/HTTPS/);
  await assert.rejects(save('puzzles',0,{...bank.data.puzzles[0],image:"https://test.com/a');color:red"},bank.id),/HTTPS/);
}));
test('old quiz versions retain their answer key after staff edits; new scores use current questions',async()=>{
  const original=(await pg.query('select data from learning_versions where id=$1',[first])).rows[0].data;
  let bank;
  await as('admin',async()=>{
    bank=await read();
    bank=await save('questions',0,{...bank.data.questions[0],a:(bank.data.questions[0].a+1)%4},bank.id);
    bank=await save('questions',null,{q:'Baru',o:['A','B','C','D'],a:2},bank.id);
    bank=await save('materials',null,{title:'Materi tambahan',body:'Isinya.'},bank.id);
  });
  await as('murid',async()=>{
    const score=async(revision,answers)=>(await pg.query("select record_content_attempt(gen_random_uuid(),'soal',999,999,$1,$2)",[JSON.stringify(answers),revision]));
    await score(first,original.questions.map(q=>q.a));
    await score(bank.id,bank.data.questions.map(q=>q.a));
    assert.deepEqual((await pg.query('select correct,total from attempts order by total')).rows,[{correct:25,total:25},{correct:26,total:26}]);
    await assert.rejects(score(bank.id,[0]),/belum lengkap/);
    await pg.query("select record_content_attempt(gen_random_uuid(),'materi',8,8,null,$1)",[bank.id]);
  });
});
test('essay answers use canonical prompts, persist once and stay private from unrelated teachers',async()=>{
  const id='00000000-0000-4000-8000-000000000044';
  await as('murid',async()=>{
    const bank=await read();
    for(let i=0;i<2;i++)await pg.query('select submit_learning_essay($1,$2,$3)',[id,bank.id,JSON.stringify([{q:'forged',answer:'Beli buku agar pintar!'}])]);
    const rows=(await pg.query('select answers from essay_submissions')).rows;
    assert.equal(rows.length,1);assert.equal(rows[0].answers[0].q,'Buat iklan komersial.');
    await assert.rejects(pg.query('select submit_learning_essay($1,$2,$3)',[id,bank.id,'[{"answer":" "}]']));
  });
  await as('other',async()=>assert.equal((await pg.query('select * from essay_submissions')).rows.length,0));
  await as('guru',async()=>assert.equal((await pg.query('select * from essay_submissions')).rows.length,0));
  await pg.query('insert into classes(id,name,teacher_id) values($1,$2,$3)',[id,'Kelas esai',ids.guru]);
  await pg.query('insert into memberships(class_id,student_id) values($1,$2)',[id,ids.murid]);
  await as('guru',async()=>assert.equal((await pg.query('select * from essay_submissions')).rows.length,1));
  await as('admin',async()=>assert.equal((await pg.query('select * from essay_submissions')).rows.length,1));
});
test('rerunning upgrade preserves edited content and prior results',async()=>{
  const before=(await pg.query('select revision from learning_current')).rows[0].revision;
  await pg.exec(migration);
  assert.equal((await pg.query('select revision from learning_current')).rows[0].revision,before);
  assert.equal((await pg.query('select count(*)::int as n from attempts')).rows[0].n,3);
});

test('delete and custom settings enforce staff role, conflicts and nonempty playable banks',async()=>{
  const remove=async(kind,index,revision)=>(await pg.query('select delete_learning_item($1,$2,$3) as bank',[kind,index,revision])).rows[0].bank;
  const settings=async(n,revision)=>(await pg.query('select save_learning_settings($1,$2) as bank',[n,revision])).rows[0].bank;
  await as('anon',()=>assert.rejects(remove('ads',0,first)));
  await as('murid',async()=>{
    await assert.rejects(remove('ads',0,first),/Hanya admin dan guru/);
    await assert.rejects(settings(7,first),/Hanya admin dan guru/);
  });
  let current;
  await as('guru',async()=>{
    let bank=await read();
    const before=bank.id;
    for(const kind of ['questions','materials','puzzles','essays','ads'])bank=await remove(kind,0,bank.id);
    assert.equal(bank.data.essays.length,0);
    await assert.rejects(remove('ads',0,before),/pengajar lain/);
    await assert.rejects(remove('ads',-1,bank.id),/tidak ditemukan/);
    await assert.rejects(settings(0,bank.id),/1 sampai 1000/);
    // Removing below the former 10+10 limit is permitted.
    while(bank.data.ads.length>3)bank=await remove('ads',0,bank.id);
    for(let i=0;i<3;i++)bank=await save('ads',i,{...bank.data.ads[i],type:'komersial'},bank.id);
    bank=await settings(7,bank.id);current=bank;
  });
  await as('murid',async()=>{
    await pg.query("select record_content_attempt(gen_random_uuid(),'game',3,3,null,$1)",[current.id]);
    await assert.rejects(pg.query("select record_content_attempt(gen_random_uuid(),'game',7,7,null,$1)",[current.id]),/pengaturan/);
    // A session using the original version is still accepted.
    await pg.query("select record_content_attempt(gen_random_uuid(),'game',20,20,null,$1)",[first]);
  });
  await as('admin',async()=>{
    let bank=await read();
    for(const kind of ['questions','materials','puzzles','ads']){
      while(bank.data[kind].length>1)bank=await remove(kind,0,bank.id);
      await assert.rejects(remove(kind,0,bank.id),/minimal satu/);
    }
  });
});
