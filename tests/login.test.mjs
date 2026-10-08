import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {JSDOM} from 'jsdom';
import {build} from 'esbuild';

const dataStub=`
const state=window.authTest;
export const configured=true;
export const db={auth:{
  async getSession(){if(state.sessionFailure)throw new Error('Network');return {data:{session:state.session?{user:{id:'student'}}:null}};},
  async signInWithPassword(values){state.submitted=values;return state.invalid?{error:new Error('Invalid login')}:{data:{user:{id:'student'}}};},
  onAuthStateChange(callback){state.listener=callback;},
  async signOut(){state.listener('SIGNED_OUT');return {};}
}};
export async function profileFor(){if(state.profileFailure)throw new Error('Missing profile');return {id:'student',full_name:'Akun Uji',role:'murid'};}
export const loginEmail=value=>({admin:'admin@jelajah-iklan.test',guru:'guru@jelajah-iklan.test',siswa:'siswa@jelajah-iklan.test'}[value.trim().toLowerCase()]||value.trim().toLowerCase());
export const dashboard=async()=>({classes:[],profiles:[],memberships:[],attempts:[]});
export const createClass=()=>{},createAccount=()=>{},changeRole=()=>{},saveAttempt=()=>{};
`;
const bundled=await build({entryPoints:['src/portal.js'],bundle:true,write:false,format:'esm',loader:{'.css':'empty'},plugins:[{name:'auth-test-adapter',setup(b){b.onResolve({filter:/^\.\/data\.js$/},()=>({path:'data',namespace:'test'}));b.onLoad({filter:/.*/,namespace:'test'},()=>({contents:dataStub,loader:'js'}));}}]});
async function setup(state={},source=bundled.outputFiles[0].text){
  const dom=new JSDOM(await fs.readFile('index.html','utf8'),{url:'https://example.test',runScripts:'dangerously',pretendToBeVisual:true});
  const w=dom.window,d=w.document;w.authTest=state;w.scrollTo=()=>{};
  w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.open=false;};
  w.eval(await fs.readFile('public/game-data.js','utf8'));w.eval(await fs.readFile('public/app.js','utf8'));
  assert.equal(d.querySelectorAll('.menu-card').length,0,'Learning content must not flash before session check');
  await w.eval(`(async()=>{${source}})()`);
  return {dom,w,d};
}
const settle=()=>new Promise(resolve=>setTimeout(resolve,10));
async function submit(w,d){
  d.querySelector('[name="email"]').value='student@example.test';d.querySelector('[name="password"]').value='Test-password';
  d.querySelector('#loginForm').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));await settle();
}
test('akun Supabase: cover, gagal login, tampilkan sandi, lalu masuk ke menu',async()=>{
  const state={invalid:true};const {dom,w,d}=await setup(state);
  try{
    assert.equal(d.querySelector('main').dataset.page,'login');assert(d.querySelector('#loginForm'));assert.equal(d.querySelector('[data-demo]'),null);
    d.querySelector('#togglePassword').click();assert.equal(d.querySelector('#loginPassword').type,'text');
    d.querySelector('#togglePassword').click();assert.equal(d.querySelector('#loginPassword').type,'password');
    await submit(w,d);assert.match(d.querySelector('.form-error').textContent,/Nama pengguna\/email atau kata sandi/);assert.equal(w.canAccessLearning(),false);
    assert.equal(d.querySelector('[type="submit"]').disabled,false);
    state.invalid=false;await submit(w,d);
    assert.equal(d.querySelector('main').dataset.page,'home');assert.equal(d.querySelectorAll('.menu-card').length,4);assert.equal(w.canAccessLearning(),true);
    state.listener('SIGNED_OUT');assert.equal(d.querySelector('main').dataset.page,'login');assert.equal(d.querySelectorAll('.menu-card').length,0);
  }finally{dom.window.close();}
});
test('akun tanpa profil tidak dapat membuka kegiatan',async()=>{
  const {dom,w,d}=await setup({profileFailure:true});
  try{await submit(w,d);assert.match(d.querySelector('.form-error').textContent,/profil belajar belum tersedia/);w.go('game');assert.equal(d.querySelector('main').dataset.page,'login');}finally{dom.window.close();}
});
test('sesi tersimpan membuka menu; gangguan sesi tetap menampilkan cover',async()=>{
  for(const state of [{session:true},{sessionFailure:true}]){
    const {dom,w,d}=await setup(state);
    try{assert.equal(d.querySelector('main').dataset.page,state.session?'home':'login');assert.equal(w.canAccessLearning(),!!state.session);}finally{dom.window.close();}
  }
});
test('tanpa konfigurasi Supabase tidak ada akun contoh atau jalur masuk lokal',async()=>{
  const unconfigured=await build({entryPoints:['src/portal.js'],bundle:true,write:false,format:'esm',loader:{'.css':'empty'},define:{'import.meta.env.VITE_SUPABASE_URL':'""','import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY':'""'}});
  const {dom,w,d}=await setup({},unconfigured.outputFiles[0].text);
  try{
    assert.match(d.querySelector('main').textContent,/Layanan akun belum terhubung/);
    assert.equal(d.querySelector('#loginForm'),null);assert.equal(d.querySelector('#openLogin'),null);
    assert.doesNotMatch(d.body.textContent,/demo/i);
    w.go('home');assert.equal(d.querySelector('main').dataset.page,'login');assert.equal(w.canAccessLearning(),false);
  }finally{dom.window.close();}
});
