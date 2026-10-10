import fs from 'node:fs/promises';
import { JSDOM } from 'jsdom';
const dom=new JSDOM(await fs.readFile('index.html','utf8'),{runScripts:'outside-only'});
dom.window.eval(await fs.readFile('public/game-data.js','utf8'));
dom.window.eval(await fs.readFile('public/app.js','utf8'));
const bank=dom.window.getLearningDefaults();
dom.window.close();
const seed=JSON.stringify(bank).replaceAll("'","''");
const base=await fs.readFile('supabase/content-management-base.sql','utf8');
const sql=base.replace('-- INITIAL_CONTENT',`-- Konten awal hanya dipasang jika bank belum ada; jalankan ulang tanpa menimpa edit pengajar.
do $seed$ declare version_id uuid; begin
  perform pg_advisory_xact_lock(20261010);
  if not exists(select 1 from public.learning_current where id=1) then
    insert into public.learning_versions(data) values('${seed}'::jsonb) returning id into version_id;
    insert into public.learning_current(id,revision) values(1,version_id);
  end if;
end $seed$;`);
await fs.writeFile('supabase/content-management.sql',sql);
console.log('Query siap: supabase/content-management.sql');
