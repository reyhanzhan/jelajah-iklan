import {test} from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
const result=await build({entryPoints:['src/data.js'],bundle:true,format:'esm',write:false,define:{'import.meta.env.VITE_SUPABASE_URL':'""','import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY':'""'}});
const data=await import('data:text/javascript;base64,'+Buffer.from(result.outputFiles[0].text).toString('base64'));
test('nama login awal dipetakan ke email Supabase dan email lain tetap didukung',()=>{
  for(const name of ['admin','guru','siswa'])assert.equal(data.loginEmail(' '+name.toUpperCase()+' '),`${name}@jelajah-iklan.test`);
  assert.equal(data.loginEmail(' Nama@Sekolah.id '),'nama@sekolah.id');
});
test('tanpa Supabase seluruh operasi data berhenti, tanpa fallback lokal',async()=>{
  assert.equal(data.configured,false);
  for(const operation of [()=>data.profileFor('id'),()=>data.dashboard(),()=>data.createClass({id:'id'},'Kelas'),()=>data.createAccount({},{}),()=>data.changeRole({},'id','admin'),()=>data.saveAttempt({},{})])await assert.rejects(operation,/Layanan akun belum terhubung/);
});
