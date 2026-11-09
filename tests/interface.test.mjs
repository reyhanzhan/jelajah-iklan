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
  w.HTMLElement.prototype.scrollIntoView=function(){w.lastScrolled=this.id;};
  w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};
  w.HTMLDialogElement.prototype.close=function(){this.open=false;};
  w.eval(await fs.readFile('public/game-data.js','utf8'));
  w.eval((await fs.readFile('public/app.js','utf8'))+'\nwindow.testAdBank = gamePool;');
  await w.eval(`(async()=>{${portal}})()`);
  return {dom,w,d:w.document};
}
const settle=()=>new Promise(resolve=>setTimeout(resolve,10));
test('lihat murid menyaring per kelas dan tetap bisa edit/hapus akun yang dipilih',async()=>{
  const {dom,w,d}=await setup();
  const submit=async()=>{d.querySelector('dialog form').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));await settle();};
  try{
    const state=w.serviceFixture;
    state.classes.push({id:'class-second',name:'Kelas Kedua',teacher_id:'fixture-guru'},{id:'class-empty',name:'Kelas Kosong',teacher_id:'fixture-guru'});
    state.profiles.push({id:'student-second',full_name:'Murid Kedua',email:'kedua@fixture.test',role:'murid'});
    state.memberships.push({class_id:'class-second',student_id:'student-second'});
    await enter(d,'guru');
    d.querySelector('[data-view-class="class-second"]').click();
    assert.equal(w.lastScrolled,'classRoster');assert.equal(d.activeElement.id,'rosterTitle');
    assert.equal(d.querySelector('#rosterTitle').textContent,'Murid di Kelas Kedua');
    assert.equal(d.querySelectorAll('#classRoster tbody tr').length,1);
    assert.match(d.querySelector('#classRoster tbody').textContent,/kedua@fixture.test/);
    assert(!d.querySelector('#classRoster [data-edit-account="fixture-murid"]'));
    d.querySelector('#classRoster [data-edit-account]').click();
    assert.equal(d.querySelector('dialog [name="email"]').value,'kedua@fixture.test');
    d.querySelector('dialog [name="full_name"]').value='Nama Diperbarui';await submit();
    assert.equal(d.querySelector('#rosterClass').value,'class-second');assert.match(d.querySelector('#classRoster tbody').textContent,/Nama Diperbarui/);
    d.querySelector('#classRoster [data-delete-account]').click();d.querySelector('#cancelRemoval').click();
    assert(state.profiles.some(p=>p.id==='student-second'));
    d.querySelector('#classRoster [data-delete-account]').click();await submit();
    assert.match(d.querySelector('#classRoster').textContent,/Belum ada murid/);assert(state.profiles.some(p=>p.id==='fixture-murid'));
    d.querySelector('[data-view-class="class-empty"]').click();assert.match(d.querySelector('#classRoster').textContent,/Belum ada murid/);
    d.querySelector('#rosterClass').value='';d.querySelector('#rosterClass').dispatchEvent(new w.Event('change'));
    assert.equal(d.querySelectorAll('#classRoster tbody tr').length,1);
    d.querySelector('[data-view-class="class-empty"]').click();
    d.querySelector('[data-delete-class="class-empty"]').click();await submit();
    assert.equal(d.querySelector('#rosterClass').value,'');assert.match(d.querySelector('#classRoster').textContent,/murid@fixture.test/);
  }finally{dom.window.close();}
});
test('ikon mata, email murid, edit akun/kelas, serta konfirmasi hapus',async()=>{
  const {dom,w,d}=await setup();
  const submit=async()=>{d.querySelector('dialog form').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));await settle();};
  try{
    assert(d.querySelector('#togglePassword svg'));
    await enter(d,'guru');
    assert.match(d.querySelector('table').textContent,/murid@fixture.test/);
    d.querySelector('[data-add]').click();
    const input=d.querySelector('dialog [name="password"]');input.value='secret';
    const toggle=input.parentElement.querySelector('button');toggle.click();assert.equal(input.type,'text');assert.equal(toggle.getAttribute('aria-pressed'),'true');toggle.click();assert.equal(input.type,'password');
    d.querySelector('.modal-head button').click();
    d.querySelector('[data-edit-class]').click();d.querySelector('dialog [name="name"]').value='Kelas Baru';await submit();
    assert.match(d.querySelector('main').textContent,/Kelas Baru/);
    d.querySelector('[data-edit-account]').click();
    d.querySelector('dialog [name="full_name"]').value='<img src=x> Nama baru';
    d.querySelector('dialog [name="email"]').value='baru@fixture.test';await submit();
    assert.match(d.querySelector('table').textContent,/baru@fixture.test/);assert.equal(d.querySelector('table img'),null);
    d.querySelector('[data-delete-account]').click();d.querySelector('#cancelRemoval').click();assert.equal(w.serviceFixture.profiles.length,3);
    d.querySelector('[data-delete-class]').click();await submit();
    assert.equal(w.serviceFixture.classes.length,0);assert.equal(w.serviceFixture.profiles.length,3);
    d.querySelector('[data-delete-account]').click();await submit();assert.equal(w.serviceFixture.profiles.length,2);
  }finally{dom.window.close();}
});
test('email akun murid terlihat di ruang belajar dan pengaturan tanpa tombol pengelolaan',async()=>{
  const {dom,d}=await setup();
  try{
    await enter(d,'murid');assert.match(d.querySelector('.account-email').textContent,/murid@fixture.test/);
    assert.equal(d.querySelector('[data-edit-account],[data-delete-class]'),null);
    d.querySelector('#settingsButton').click();assert.match(d.querySelector('dialog').textContent,/murid@fixture.test/);
    d.querySelector('#changePassword').click();assert.equal(d.querySelectorAll('dialog .password-field svg').length,2);
  }finally{dom.window.close();}
});
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
      choose('essays');d.querySelector('#addContent').click();fill('q','Tuliskan iklan buatanmu.');fill('guidance','Satu paragraf.');
      assert.equal(d.querySelectorAll('dialog .essay-option-editor').length,3);
      fill('option0Title','Poster hemat air');fill('option0Image','/poster-hemat-air.jpeg');fill('option0Question','Apa ajakan pada poster?');fill('option0Keywords','hemat air, keran');
      fill('option1Title','Poster roti');fill('option1Image','/poster-roti.svg');fill('option1Question','Apa promo pada iklan?');fill('option1Keywords','beli, gratis');
      fill('option2Title','Poster vaksinasi');fill('option2Image','/poster-vaksinasi.jpeg');fill('option2Question','Layanan apa yang ditawarkan?');fill('option2Keywords','vaksinasi, harga');
      await save();
      assert.equal(w.getLearningContent().essays[0].imageOptions.length,3);
      d.querySelector('#settingsButton').click();d.querySelector('#logout').click();await settle();
      await enter(d,'murid');assert.equal(d.querySelector('[data-tab="konten"]'),null);
      w.go('materi');assert.match(d.querySelector('main').textContent,/Judul baru materials/);
      w.go('esai');const choices=d.querySelectorAll('.essay-image-option');assert.equal(choices.length,3);choices[0].click();
      assert.equal(d.querySelectorAll('.essay-image-option:disabled').length,2);
      assert.match(d.querySelector('label').textContent,/Apa ajakan pada poster/);
      const answer=d.querySelector('#essayForm textarea');answer.value='Hemat air dan tutup keran.';answer.dispatchEvent(new w.Event('input',{bubbles:true}));
      d.querySelector('#essayForm').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));await settle();
      assert.equal(w.serviceFixture.essayAnswers[0].answer,'Hemat air dan tutup keran.');
      assert.deepEqual(Array.from(w.serviceFixture.essayAnswers[0].matchedKeywords),['hemat air','keran']);
      assert.match(d.querySelector('.save-status').textContent,/tersimpan/);
    }finally{dom.window.close();}
  }
});

test('hapus meminta konfirmasi dan pengaturan kartu custom digunakan murid',async()=>{
  const {dom,w,d}=await setup();
  try{
    await enter(d,'guru');d.querySelector('[data-tab="konten"]').click();
    const select=d.querySelector('#contentKind');select.value='ads';select.dispatchEvent(new w.Event('change'));
    const before=w.getLearningContent().ads.length;
    d.querySelector('[data-delete-content="0"]').click();d.querySelector('#cancelDeleteContent').click();
    assert.equal(w.getLearningContent().ads.length,before);
    d.querySelector('[data-delete-content="0"]').click();d.querySelector('#confirmDeleteContent').click();await settle();
    assert.equal(w.getLearningContent().ads.length,before-1);
    d.querySelector('#gameSettings [name="adCount"]').value='3';
    d.querySelector('#gameSettings').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));await settle();
    assert.equal(w.getLearningContent().settings.adCount,3);
    // All ads may have the same category; there is no forced quota.
    w.serviceFixture.content.data.ads=w.serviceFixture.content.data.ads.slice(0,3).map(ad=>({...ad,type:'komersial'}));
    d.querySelector('#settingsButton').click();d.querySelector('#logout').click();await settle();await signIn(d,'murid');
    w.go('game');
    for(let i=0;i<3;i++){assert.match(d.querySelector('.status-line').textContent,/dari 3/);d.querySelector('#commercial').click();d.querySelector('#gameFeedback .primary').click();}
    await settle();assert.equal(d.querySelector('[data-game-score]').textContent,'100');
    assert.equal(w.serviceFixture.attempts[0].total,3);
    const bank=w.getLearningContent();bank.settings.adCount=20;w.applyLearningContent(bank,'test');w.startGame();
    assert.match(d.querySelector('.status-line').textContent,/dari 3/);
  }finally{dom.window.close();}
});

test('hasil belajar menampilkan batang benar/salah, nilai 0–100, filter dan urutan',async()=>{
  const {dom,w,d}=await setup();
  try{
    await enter(d,'admin');
    const state=w.serviceFixture;
    state.profiles.find(p=>p.role==='murid').full_name='<img src=x> Murid';
    state.attempts.push(
      {student_id:'fixture-murid',activity:'game',correct:0,total:7,created_at:'2026-10-13T03:00:00Z'},
      {student_id:'fixture-murid',activity:'soal',correct:5,total:6,created_at:'2026-10-12T03:00:00Z'},
      {student_id:'fixture-murid',activity:'puzzle',correct:3,total:3,created_at:'2026-10-11T03:00:00Z'},
      {student_id:'fixture-murid',activity:'materi',correct:7,total:7,created_at:'2026-10-10T03:00:00Z'});
    d.querySelector('[data-tab="hasil"]').click();
    assert.deepEqual([...d.querySelectorAll('.result-grade b')].map(el=>el.textContent),['100','83','0']);
    const cards=d.querySelectorAll('.result-card');
    assert.equal(cards[0].querySelector('.answer-wrong'),null);
    assert.equal(cards[2].querySelector('.answer-correct'),null);
    assert.equal(cards[1].querySelector('.answer-bar').getAttribute('aria-label'),'5 benar, 1 salah dari 6 soal');
    assert.match(cards[3].textContent,/Selesai/);assert.equal(cards[3].querySelector('.answer-bar'),null);
    assert.equal(d.querySelector('.result-person img'),null);
    const sort=d.querySelector('#resultSort');sort.value='recent';sort.dispatchEvent(new w.Event('change'));
    assert.equal(d.querySelector('.result-grade b').textContent,'0');
    const filter=d.querySelector('#activityFilter');filter.value='soal';filter.dispatchEvent(new w.Event('change'));
    assert.equal(d.querySelectorAll('.result-card').length,1);assert.equal(d.querySelector('.result-grade b').textContent,'83');
    state.attempts.length=0;filter.dispatchEvent(new w.Event('change'));assert.match(d.querySelector('#resultRows').textContent,/Belum ada hasil/);
  }finally{dom.window.close();}
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
test('Pilah Iklan berisi 20 kartu unik secara default, dengan komposisi bebas',async()=>{
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
      assert.equal(messages.size,20);assert.equal(commercial+noncommercial,20);
      assert.match(d.querySelector('main').textContent,/Nilai akhirmu/);
      assert.match(d.querySelector('.save-status').textContent,/Hasil belajar tersimpan/);
      const attempts=w.serviceFixture.attempts;
      assert.equal(attempts.length,round+1);assert.equal(attempts[round].total,20);assert.equal(attempts[round].correct,commercial);
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
    d.querySelector('[name="password"]').value='murid1';
    assert.equal(d.querySelector('[name="password"]').minLength,-1);
    d.querySelector('form').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));await settle();
    assert.match(d.querySelector('main').textContent,/<script>alert\(1\)<\/script>/);
    assert.equal(d.querySelectorAll('main script').length,0);
    assert(!JSON.stringify(w.serviceFixture).includes('murid1'));
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
