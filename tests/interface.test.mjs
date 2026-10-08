import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {JSDOM} from 'jsdom';
import {build} from 'esbuild';

const bundle=await build({entryPoints:['src/portal.js'],bundle:true,write:false,format:'esm',loader:{'.css':'empty'},define:{'import.meta.env.VITE_SUPABASE_URL':'""','import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY':'""'}});
const portal=bundle.outputFiles[0].text;
async function setup(){
  const dom=new JSDOM(await fs.readFile('index.html','utf8'),{url:'http://localhost',runScripts:'dangerously',pretendToBeVisual:true});
  const w=dom.window;
  w.scrollTo=()=>{};
  w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};
  w.HTMLDialogElement.prototype.close=function(){this.open=false;};
  w.eval(await fs.readFile('public/game-data.js','utf8'));
  w.eval(await fs.readFile('public/app.js','utf8'));
  await w.eval(`(async()=>{${portal}})()`);
  return {dom,w,d:w.document};
}
const settle=()=>new Promise(resolve=>setTimeout(resolve,10));
async function enter(d,role){d.querySelector('#openLogin').click();d.querySelector(`[data-demo="${role}"]`).click();await settle();}

test('tampilan APK, 25 soal, hasil tersimpan dan terbaca di ruang murid',async()=>{
  const {dom,w,d}=await setup();
  try{
    assert.equal(d.querySelectorAll('.menu-card').length,4);
    assert.match(d.querySelector('.hero').textContent,/detektif iklan/);
    await enter(d,'murid');
    assert.match(d.querySelector('main').textContent,/Halo, Murid Demo/);
    d.querySelector('#startLearning').click();
    assert(d.querySelector('#openDashboard'));
    d.querySelector('[onclick="go(\'tantangan\')"]').click();
    assert.equal(d.querySelectorAll('.challenge-grid .menu-card').length,2);
    d.querySelector('[onclick="go(\'soal\')"]').click();
    for(let i=0;i<25;i++){d.querySelectorAll('.option')[0].click();d.querySelector('.actions .primary').click();}
    await settle();
    assert.match(d.querySelector('main').textContent,/Hasil belajarmu/);
    assert.match(d.querySelector('.save-status').textContent,/Hasil tersimpan/);
    const saved=JSON.parse(w.localStorage.getItem('jelajah-demo-v1'));
    assert.equal(saved.attempts.length,1);assert.equal(saved.attempts[0].total,25);
    w.go('home');d.querySelector('#openDashboard').click();await settle();
    d.querySelector('[data-tab="hasil"]').click();
    assert.match(d.querySelector('#resultRows').textContent,/Pilihan Ganda/);
  }finally{dom.window.close();}
});
test('Pilah Iklan berisi 20 kartu unik dan selalu seimbang, termasuk saat diulang',async()=>{
  const {dom,w,d}=await setup();
  try{
    await enter(d,'murid');d.querySelector('#startLearning').click();
    w.go('game');
    for(let round=0;round<2;round++){
      const messages=new Set();let commercial=0,noncommercial=0;
      for(let i=0;i<20;i++){
        assert.match(d.querySelector('.status-line').textContent,new RegExp(`Kartu ${i+1} dari 20`));
        messages.add(d.querySelector('.ad-card small').textContent);
        d.querySelector('#commercial').click();
        if(d.querySelector('#gameFeedback .good'))commercial++;else noncommercial++;
        d.querySelector('#gameFeedback .primary').click();
      }
      await settle();
      assert.equal(messages.size,20);assert.equal(commercial,10);assert.equal(noncommercial,10);
      assert.match(d.querySelector('main').textContent,/permainan selesai/);
      assert.match(d.querySelector('.save-status').textContent,/Hasil tersimpan/);
      const attempts=JSON.parse(w.localStorage.getItem('jelajah-demo-v1')).attempts;
      assert.equal(attempts.length,round+1);assert.equal(attempts[round].total,20);assert.equal(attempts[round].correct,10);
      if(round===0)d.querySelector('[onclick="startGame()"]').click();
    }
  }finally{dom.window.close();}
});
test('Tantangan Pintar bercabang ke pilihan ganda dan esai; tombol kembali mempertahankan jawaban',async()=>{
  const {dom,w,d}=await setup();
  try{
    assert.deepEqual([...d.querySelectorAll('.menu-card b')].map(el=>el.textContent),['Materi','Pilah Iklan','Game','Tantangan Pintar']);
    d.querySelector('[onclick="go(\'tantangan\')"]').click();
    d.querySelector('[onclick="go(\'esai\')"]').click();
    assert.match(d.querySelector('main').textContent,/Segera hadir/);
    assert.equal(d.querySelectorAll('textarea').length,0);
    d.querySelector('#backButton').click();
    assert.equal(d.querySelector('main').dataset.page,'tantangan');
    d.querySelector('[onclick="go(\'soal\')"]').click();
    d.querySelectorAll('.option')[2].click();
    d.querySelector('#backButton').click();
    d.querySelector('[onclick="go(\'soal\')"]').click();
    assert(d.querySelectorAll('.option')[2].classList.contains('selected'));
    d.querySelector('#backButton').click();d.querySelector('#backButton').click();
    assert.equal(d.querySelector('main').dataset.page,'home');
    assert.equal(w.localStorage.getItem('jelajah-demo-v1'),null);
  }finally{dom.window.close();}
});
test('Game memiliki lima poster unik: tiga komersial, dua nonkomersial, dan analisis tersimpan',async()=>{
  const {dom,w,d}=await setup();
  try{
    await enter(d,'murid');d.querySelector('#startLearning').click();w.go('puzzle');
    const posters=new Set();let commercial=0,noncommercial=0;
    for(let round=0;round<5;round++){
      assert.match(d.querySelector('.lead').textContent,/5 poster: 3 komersial dan 2 nonkomersial/);
      for(let target=0;target<9;target++){
        const pieces=[...d.querySelectorAll('.puzzle-piece')];
        const source=pieces.findIndex(p=>p.style.backgroundPosition===`${target%3*50}% ${Math.floor(target/3)*50}%`);
        if(source!==target){pieces[target].click();d.querySelectorAll('.puzzle-piece')[source].click();}
      }
      d.querySelector('[onclick="renderAnalysis()"]').click();
      const asset=d.querySelector('.puzzle-preview').getAttribute('src');
      posters.add(asset);assert((await fs.stat(`public/${asset}`)).size>0);
      d.querySelector('[data-analysis="0"][data-answer="0"]').click();
      d.querySelector('[data-analysis="1"][data-answer="1"]').click();
      d.querySelector('[data-analysis="2"][data-answer="0"]').click();
      d.querySelector('#checkAnalysis').click();await settle();
      if(d.querySelector('[data-analysis="0"][data-answer="0"]').classList.contains('correct'))commercial++;else noncommercial++;
      assert.match(d.querySelector('.save-status').textContent,/Hasil tersimpan/);
      if(round<4)d.querySelector('#analysisFeedback .secondary').click();
    }
    assert.equal(posters.size,5);assert.equal(commercial,3);assert.equal(noncommercial,2);
    const attempts=JSON.parse(w.localStorage.getItem('jelajah-demo-v1')).attempts;
    assert.equal(attempts.length,5);assert(attempts.every(a=>a.activity==='puzzle'&&a.total===3));
    d.querySelector('#analysisFeedback .primary').click();assert.equal(d.querySelector('main').dataset.page,'tantangan');
  }finally{dom.window.close();}
});
test('guru membuat kelas dan akun murid tanpa menyimpan kata sandi demo',async()=>{
  const {dom,w,d}=await setup();
  try{
    await enter(d,'guru');d.querySelector('#newClass').click();
    d.querySelector('[name="name"]').value='Kelas Uji';
    d.querySelector('form').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));await settle();
    assert.match(d.querySelector('main').textContent,/Kelas Uji/);
    const buttons=d.querySelectorAll('[data-add]');buttons[buttons.length-1].click();
    d.querySelector('[name="full_name"]').value='<script>alert(1)</script>';
    d.querySelector('[name="email"]').value='uji@example.com';
    d.querySelector('[name="password"]').value='test-password-only';
    d.querySelector('form').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));await settle();
    assert.match(d.querySelector('main').textContent,/<script>alert\(1\)<\/script>/);
    assert.equal(d.querySelectorAll('main script').length,0);
    assert(!w.localStorage.getItem('jelajah-demo-v1').includes('test-password-only'));
  }finally{dom.window.close();}
});
test('admin melihat akun; keluar membersihkan sesi dan akses dasbor',async()=>{
  const {dom,d}=await setup();
  try{
    await enter(d,'admin');d.querySelector('[data-tab="akun"]').click();
    assert.equal(d.querySelectorAll('[data-role-user]').length,3);
    assert(d.querySelector('[data-role-user="demo-admin"]').disabled);
    d.querySelector('#settingsButton').click();d.querySelector('#logout').click();await settle();
    assert(d.querySelector('#openLogin'));assert(!d.querySelector('#openDashboard'));
  }finally{dom.window.close();}
});
test('musik hidup/mati dan volume tersimpan, materi serta puzzle tetap bekerja',async()=>{
  const {dom,w,d}=await setup();
  try{
    let starts=0,suspends=0;
    w.AudioContext=class{currentTime=0;destination={};resume(){return Promise.resolve();}suspend(){suspends++;return Promise.resolve();}createGain(){return {gain:{value:0,setValueAtTime(){},linearRampToValueAtTime(){},exponentialRampToValueAtTime(){}},connect(){},disconnect(){}};}createOscillator(){return {frequency:{value:0},connect(){},disconnect(){},start(){starts++;},stop(){}};}};
    d.querySelector('#settingsButton').click();
    const toggle=d.querySelector('#musicToggle');toggle.checked=true;toggle.dispatchEvent(new w.Event('change'));await settle();
    assert(starts>0);
    const volume=d.querySelector('#volume');volume.value='60';volume.dispatchEvent(new w.Event('input'));
    toggle.checked=false;toggle.dispatchEvent(new w.Event('change'));await settle();
    assert(suspends>0);assert.deepEqual(JSON.parse(w.localStorage.getItem('jelajah-music')),{enabled:false,volume:0.6});
    d.querySelector('.modal-head button').click();
    await enter(d,'murid');d.querySelector('#startLearning').click();w.go('materi');
    for(let i=0;i<7;i++)d.querySelector('.lesson-nav .primary').click();await settle();
    assert.equal(JSON.parse(w.localStorage.getItem('jelajah-demo-v1')).attempts[0].activity,'materi');
    w.go('puzzle');assert.equal(d.querySelectorAll('.puzzle-piece').length,9);
    // Solve by swapping actual pieces from the DOM background position.
    for(let target=0;target<9;target++){
      const pieces=[...d.querySelectorAll('.puzzle-piece')];
      const source=pieces.findIndex(p=>p.style.backgroundPosition===`${target%3*50}% ${Math.floor(target/3)*50}%`);
      if(source!==target){pieces[target].click();d.querySelectorAll('.puzzle-piece')[source].click();}
    }
    assert.match(d.querySelector('#puzzleMessage').textContent,/Puzzle selesai/);
  }finally{dom.window.close();}
});
