import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {JSDOM} from 'jsdom';
import {build} from 'esbuild';
import {fixtureSource} from './helpers/service-fixture.mjs';

const bundle=await build({entryPoints:['src/portal.js'],bundle:true,write:false,format:'esm',loader:{'.css':'empty'},plugins:[{name:'service-fixture',setup(b){b.onResolve({filter:/^\.\/data\.js$/},()=>({path:'data',namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:fixtureSource,loader:'js'}));}}]});
const portal=bundle.outputFiles[0].text;
async function setup(){
  const dom=new JSDOM(await fs.readFile('index.html','utf8'),{url:'http://localhost',runScripts:'dangerously',pretendToBeVisual:true});
  const w=dom.window;
  w.scrollTo=()=>{};
  w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};
  w.HTMLDialogElement.prototype.close=function(){this.open=false;};
  w.eval(await fs.readFile('public/game-data.js','utf8'));
  w.eval((await fs.readFile('public/app.js','utf8'))+'\nwindow.testAdBank = gamePool;');
  await w.eval(`(async()=>{${portal}})()`);
  return {dom,w,d:w.document};
}
const settle=()=>new Promise(resolve=>setTimeout(resolve,10));
async function signIn(d,role){d.querySelector('[name="email"]').value=role+'@fixture.test';d.querySelector('[name="password"]').value='test-password-only';d.querySelector('#loginForm').dispatchEvent(new d.defaultView.Event('submit',{bubbles:true,cancelable:true}));await settle();}
async function enter(d,role){await signIn(d,role);d.querySelector('#openDashboard').click();await settle();}

test('admin dan guru menambah dan mengedit semua kategori; murid melihat konten yang tersimpan',async()=>{
  for(const role of ['admin','guru']){
    const {dom,w,d}=await setup();
    try{
      await enter(d,role);d.querySelector('[data-tab="konten"]').click();
      const choose=kind=>{const select=d.querySelector('#contentKind');select.value=kind;select.dispatchEvent(new w.Event('change'));};
      const fill=(name,value)=>{d.querySelector('dialog [name="'+name+'"]').value=value;};
      const save=async()=>{d.querySelector('dialog form').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));await settle();assert.equal(d.querySelector('dialog').open,false);};
      choose('questions');d.querySelector('#addContent').click();
      fill('q','Apa tujuan iklan baru?');for(let i=0;i<4;i++)fill('o'+i,'Pilihan '+i);fill('a','2');fill('explanation','Pembahasan baru');await save();
      assert.equal(w.getLearningContent().questions.length,26);
      for(const kind of ['ads','materials','puzzles']){
        choose(kind);d.querySelector('[data-edit-content="0"]').click();fill('title','Judul baru '+kind);await save();
        assert.equal(w.getLearningContent()[kind][0].title,'Judul baru '+kind);
      }
      choose('essays');d.querySelector('#addContent').click();fill('q','Tuliskan iklan buatanmu.');fill('guidance','Satu paragraf.');await save();
      d.querySelector('#settingsButton').click();d.querySelector('#logout').click();await settle();
      await enter(d,'murid');assert.equal(d.querySelector('[data-tab="konten"]'),null);
      w.go('materi');assert.match(d.querySelector('main').textContent,/Judul baru materials/);
      w.go('esai');const answer=d.querySelector('textarea');answer.value='Beli buku kami!';answer.dispatchEvent(new w.Event('input',{bubbles:true}));
      d.querySelector('#essayForm').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));await settle();
      assert.equal(w.serviceFixture.essayAnswers[0].answer,'Beli buku kami!');assert.match(d.querySelector('.save-status').textContent,/tersimpan/);
    }finally{dom.window.close();}
  }
});

test('edited content is escaped in lessons, ads and puzzle questions',async()=>{
  const {dom,w,d}=await setup();
  try{
    await signIn(d,'murid');const bank=w.getLearningContent();
    bank.materials[0]={title:'<img src=x onerror=alert(1)>',body:'<script>bad</script>'};
    bank.ads.forEach(item=>item.icon='<img src=x onerror=alert(1)>');
    bank.puzzles.forEach(item=>item.thirdQuestion='<img src=x onerror=alert(1)>');
    w.applyLearningContent(bank,'test');w.go('materi');assert.equal(d.querySelector('main script'),null);assert.equal(d.querySelector('.page-title img'),null);
    w.go('game');assert.equal(d.querySelector('.ad-icon img'),null);
    w.go('puzzle');w.renderAnalysis();assert.equal(d.querySelector('.analysis-question img'),null);
  }finally{dom.window.close();}
});

test('tampilan APK, 25 soal, hasil tersimpan dan terbaca di ruang murid',async()=>{
  const {dom,w,d}=await setup();
  try{
    assert.equal(d.querySelectorAll('.menu-card').length,0);
    assert(d.querySelector('.login-cover'));
    await enter(d,'murid');
    assert.match(d.querySelector('main').textContent,/Halo, Murid Uji/);
    d.querySelector('#startLearning').click();
    assert.equal(d.querySelectorAll('.menu-card').length,4);
    assert.match(d.querySelector('.hero').textContent,/detektif iklan/);
    assert(d.querySelector('#openDashboard'));
    d.querySelector('[onclick="go(\'tantangan\')"]').click();
    assert.equal(d.querySelectorAll('.challenge-grid .menu-card').length,2);
    d.querySelector('[onclick="go(\'soal\')"]').click();
    for(let i=0;i<25;i++){d.querySelectorAll('.option')[0].click();d.querySelector('.actions .primary').click();}
    await settle();
    assert.match(d.querySelector('main').textContent,/Hasil belajarmu/);
    assert.match(d.querySelector('.save-status').textContent,/Hasil belajar tersimpan/);
    const saved=w.serviceFixture;
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
      assert.match(d.querySelector('.save-status').textContent,/Hasil belajar tersimpan/);
      const attempts=w.serviceFixture.attempts;
      assert.equal(attempts.length,round+1);assert.equal(attempts[round].total,20);assert.equal(attempts[round].correct,10);
      if(round===0)d.querySelector('[onclick="startGame()"]').click();
    }
  }finally{dom.window.close();}
});
test('Tantangan Pintar bercabang ke pilihan ganda dan esai; tombol kembali mempertahankan jawaban',async()=>{
  const {dom,w,d}=await setup();
  try{
    await enter(d,'murid');d.querySelector('#startLearning').click();
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
    assert.equal(w.serviceFixture.attempts.length,0);
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
      assert.match(d.querySelector('.save-status').textContent,/Hasil belajar tersimpan/);
      if(round<4)d.querySelector('#analysisFeedback .secondary').click();
    }
    assert.equal(posters.size,5);assert.equal(commercial,3);assert.equal(noncommercial,2);
    const attempts=w.serviceFixture.attempts;
    assert.equal(attempts.length,5);assert(attempts.every(a=>a.activity==='puzzle'&&a.total===3));
    d.querySelector('#analysisFeedback .primary').click();assert.equal(d.querySelector('main').dataset.page,'tantangan');
  }finally{dom.window.close();}
});
test('guru membuat kelas dan akun murid tanpa menyimpan kata sandi',async()=>{
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
    assert(!JSON.stringify(w.serviceFixture).includes('test-password-only'));
  }finally{dom.window.close();}
});
test('admin melihat akun; keluar membersihkan sesi dan akses dasbor',async()=>{
  const {dom,d}=await setup();
  try{
    await enter(d,'admin');d.querySelector('[data-tab="akun"]').click();
    assert.equal(d.querySelectorAll('[data-role-user]').length,3);
    assert(d.querySelector('[data-role-user="fixture-admin"]').disabled);
    d.querySelector('#settingsButton').click();d.querySelector('#logout').click();await settle();
    assert(d.querySelector('#loginForm'));assert(!d.querySelector('#openDashboard'));
    assert(d.querySelector('.login-cover'));assert.equal(d.querySelectorAll('.menu-card').length,0);
  }finally{dom.window.close();}
});
test('cover membatasi navigasi sebelum masuk dan sesudah keluar',async()=>{
  const {dom,w,d}=await setup();
  try{
    for(const page of ['home','materi','game','puzzle','tantangan','soal']){
      w.go(page);assert.equal(d.querySelector('main').dataset.page,'login');assert.equal(d.querySelectorAll('.menu-card,.ad-card,.puzzle-piece,.option').length,0);
    }
    await signIn(d,'murid');
    assert.equal(d.querySelector('main').dataset.page,'home');assert.equal(d.querySelectorAll('.menu-card').length,4);
    d.querySelector('#settingsButton').click();d.querySelector('#logout').click();await settle();
    w.go('game');assert.equal(d.querySelector('main').dataset.page,'login');assert.equal(w.canAccessLearning(),false);
  }finally{dom.window.close();}
});
test('nilai Pilah Iklan 100, 95, 65, dan 0 sesuai jawaban; feedback menjelaskan alasannya',async()=>{
  const {dom,w,d}=await setup();
  try{
    await enter(d,'murid');d.querySelector('#startLearning').click();
    for(const correctCount of [20,19,13,0]){
      w.startGame();
      for(let i=0;i<20;i++){
        const adMessage=d.querySelector('.ad-card small').textContent;
        const type=w.testAdBank.find(ad=>ad.line===adMessage).type;
        const correct=i<correctCount;
        const selected=correct?type:(type==='komersial'?'nonkomersial':'komersial');
        d.querySelector(selected==='komersial'?'#commercial':'#noncommercial').click();
        const feedback=d.querySelector('#gameFeedback .feedback');
        assert.match(feedback.textContent,correct?/Ya, jawabanmu benar!/:/Maaf, jawabanmu salah/);
        assert.match(feedback.textContent,/karena/);
        assert(feedback.textContent.includes(adMessage));
        d.querySelector('#commercial').click(); // Disabled answers cannot score twice.
        d.querySelector('#gameFeedback .primary').click();
      }
      await settle();
      assert.equal(Number(d.querySelector('[data-game-score]').textContent),correctCount*5);
      assert.match(d.querySelector('.score-breakdown').textContent,new RegExp(`${20-correctCount} jawaban salah`));
      const attempt=w.serviceFixture.attempts.at(-1);
      assert.equal(attempt.correct,correctCount);assert.equal(attempt.total,20);
    }
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
    assert.equal(w.serviceFixture.attempts[0].activity,'materi');
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
