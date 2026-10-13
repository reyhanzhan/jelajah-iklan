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

test('pembuatan akun menjelaskan fungsi belum dipasang, sesi kedaluwarsa, dan error autentikasi',async()=>{
  const wired=await build({entryPoints:['src/data.js'],bundle:true,format:'esm',write:false,
    define:{'import.meta.env.VITE_SUPABASE_URL':'"https://example.supabase.co"','import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY':'"test-key"'},
    plugins:[{name:'account-client-test',setup(b){b.onResolve({filter:/^@supabase\/supabase-js$/},()=>({path:'client',namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:'export const createClient=()=>({functions:{invoke:async()=>globalThis.accountInvokeResult}});',loader:'js'}));}}]});
  const connected=await import('data:text/javascript;base64,'+Buffer.from(wired.outputFiles[0].text).toString('base64'));
  try{
    for(const [status,body,expected] of [[404,{code:'NOT_FOUND',message:'Requested function was not found'},/belum terpasang/],[401,{message:'Invalid JWT'},/Sesi tidak valid/],[409,{error:'Email ini sudah digunakan.'},/Email ini sudah digunakan/]]){
      globalThis.accountInvokeResult={error:{context:new Response(JSON.stringify(body),{status})}};
      await assert.rejects(connected.createAccount({},{}),expected);
    }
    globalThis.accountInvokeResult={error:{name:'FunctionsFetchError'}};
    await assert.rejects(connected.createAccount({},{}),/tidak dapat dihubungi/);
    globalThis.accountInvokeResult={data:{id:'created'}};
    assert.equal((await connected.createAccount({},{})).id,'created');
  }finally{delete globalThis.accountInvokeResult;}
});
