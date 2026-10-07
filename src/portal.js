import './portal.css';
import { Music } from './music.js';
import { db, configured, demoUser, profileFor, dashboard, createClass, createAccount, changeRole, saveAttempt } from './data.js';

const music = new Music();
const main = document.getElementById('main');
const root = document.getElementById('portal');
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const roles = {admin:'Admin',guru:'Guru',murid:'Murid'};
const activities = {materi:'Materi',game:'Game',puzzle:'Puzzle',soal:'Soal-soal'};
let user = null, currentTab = 'kelas', data = null, renderId = 0;
let latestSave = null;
const pending = new Map();

function notify(message) { window.toast(message); }
function message(error) { return error?.message || 'Terjadi kendala. Silakan coba lagi.'; }
function modal(title, body) {
  root.querySelector('dialog')?.close();
  root.innerHTML = `<dialog class="modal" aria-labelledby="dialogTitle"><div class="modal-head"><h2 id="dialogTitle">${escape(title)}</h2><button type="button" aria-label="Tutup">×</button></div>${body}</dialog>`;
  const dialog = root.querySelector('dialog');
  dialog.querySelector('.modal-head button').onclick = () => dialog.close();
  dialog.addEventListener('click', e => { if (e.target === dialog) { const r = dialog.getBoundingClientRect(); if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) dialog.close(); } });
  dialog.showModal();
  return dialog;
}
function formSubmit(dialog, callback) {
  const form = dialog.querySelector('form');
  form.onsubmit = async event => {
    event.preventDefault();
    const button = form.querySelector('[type="submit"]');
    const error = form.querySelector('.form-error');
    error.textContent = ''; button.disabled = true;
    try { await callback(Object.fromEntries(new FormData(form)), form); }
    catch (e) { error.textContent = message(e); }
    finally { button.disabled = false; }
  };
}
function strip() {
  if (main.dataset.page === 'dashboard') return;
  main.querySelector('.account-strip')?.remove();
  const el = document.createElement('section');
  el.className = 'account-strip'; el.setAttribute('aria-label','Akun belajar');
  el.innerHTML = user ? `<span class="avatar">${escape(user.full_name.slice(0,1).toUpperCase())}</span><div class="account-copy"><strong>Halo, ${escape(user.full_name)}!</strong><small>${roles[user.role]}${configured?'':' · Mode demo'}</small></div><button id="openDashboard">Ruang belajar</button>` : `<span class="avatar">✦</span><div class="account-copy"><strong>Selamat datang, detektif!</strong><small>Masuk untuk menyimpan hasil belajarmu.</small></div><button id="openLogin">Masuk</button>`;
  main.prepend(el);
  el.querySelector('button').onclick = user ? openDashboard : login;
}

function login() {
  if (!configured) {
    const dialog = modal('Coba ruang belajar', `<div class="auth-hero"><img src="/mascot.svg" alt="Maskot Jelajah Iklan"><h2>Satu petualangan, tiga peran.</h2><p class="muted">Pilih peran untuk mencoba fitur website.</p></div><div class="notice">Mode demo lokal. Data disimpan di browser ini; akun dan database sekolah belum terhubung.</div><div class="demo-roles">${Object.entries(roles).map(([role,label])=>`<button class="secondary" data-demo="${role}">${label}</button>`).join('')}</div>`);
    dialog.querySelectorAll('[data-demo]').forEach(button => button.onclick = () => {
      user = demoUser(button.dataset.demo);
      latestSave = null; pending.clear(); window.resetLearningSession?.();
      dialog.close(); openDashboard();
    });
    return;
  }
  const dialog = modal('Masuk ke Jelajah Iklan', `<form class="form-stack"><p class="muted">Gunakan akun yang diberikan admin atau gurumu.</p><label>Email<input type="email" name="email" autocomplete="username" required maxlength="254"></label><label>Kata sandi<input name="password" type="password" autocomplete="current-password" required></label><p class="form-error" role="alert"></p><button class="primary" type="submit">Masuk dan mulai belajar →</button><p class="muted">Belum punya akun atau lupa kata sandi? Hubungi guru atau admin sekolah.</p></form>`);
  formSubmit(dialog, async values => {
    const result = await db.auth.signInWithPassword({email:values.email.trim(),password:values.password});
    if (result.error) throw new Error('Email atau kata sandi tidak cocok. Periksa kembali akunmu.');
    user = await profileFor(result.data.user.id);
    latestSave = null; pending.clear(); window.resetLearningSession?.();
    dialog.close(); openDashboard();
  });
}

function settings() {
  const dialog = modal('Pengaturan', `<div class="setting-row"><div><b>Musik latar</b><small>Teman ringan saat belajar.</small></div><input id="musicToggle" class="switch" type="checkbox" role="switch" aria-label="Musik latar" ${music.enabled?'checked':''}></div><div class="setting-row"><div><b>Volume musik</b><small id="volumeValue">${Math.round(music.volume*100)}%</small></div><input class="volume" id="volume" type="range" min="0" max="100" value="${Math.round(music.volume*100)}" aria-label="Volume musik"></div><p class="muted">Pengaturan musik tersimpan di perangkat ini. Musik dimulai setelah kamu berinteraksi dengan halaman.</p><p class="form-error" role="alert" id="musicError"></p>${user?`<div class="setting-row"><div><b>${escape(user.full_name)}</b><small>${roles[user.role]}${configured?'':' · Demo lokal'}</small></div><button class="secondary" id="logout">Keluar</button></div>${configured?'<button class="secondary full" id="changePassword" style="margin-top:16px">Ganti kata sandi</button>':''}`:'<button class="primary full" id="settingsLogin">Masuk ke akun</button>'}`);
  dialog.querySelector('#musicToggle').onchange = async event => {
    try { await music.setEnabled(event.target.checked); }
    catch (error) { dialog.querySelector('#musicError').textContent = message(error); event.target.checked = false; await music.setEnabled(false); }
  };
  dialog.querySelector('#volume').oninput = event => { music.setVolume(Number(event.target.value)/100); dialog.querySelector('#volumeValue').textContent = `${event.target.value}%`; };
  dialog.querySelector('#settingsLogin')?.addEventListener('click', login);
  dialog.querySelector('#changePassword')?.addEventListener('click', passwordDialog);
  dialog.querySelector('#logout')?.addEventListener('click', async () => {
    try {
      if (db) { const {error} = await db.auth.signOut(); if (error) throw error; }
      user = null; data = null; pending.clear(); latestSave = null; renderId++;
      window.resetLearningSession?.(); dialog.close(); window.go('home'); strip();
    } catch (error) { notify(message(error)); }
  });
}
function passwordDialog() {
  const dialog = modal('Ganti kata sandi', '<form class="form-stack"><label>Kata sandi baru<input name="password" type="password" minlength="10" autocomplete="new-password" required></label><label>Ulangi kata sandi baru<input name="confirm" type="password" minlength="10" autocomplete="new-password" required></label><p class="muted">Gunakan minimal 10 karakter.</p><p class="form-error" role="alert"></p><button class="primary" type="submit">Simpan kata sandi</button></form>');
  formSubmit(dialog, async values => {
    if (values.password !== values.confirm) throw new Error('Kedua kata sandi harus sama.');
    const {error} = await db.auth.updateUser({password:values.password}); if (error) throw error;
    dialog.close(); notify('Kata sandi berhasil diperbarui.');
  });
}

async function openDashboard() {
  if (!user) return login();
  const ticket = ++renderId;
  main.dataset.page = 'dashboard';
  document.getElementById('backButton').classList.remove('hidden');
  document.getElementById('topTag').textContent = `Ruang ${roles[user.role]}`;
  main.innerHTML = '<div class="loading" role="status">Memuat ruang belajar…</div>';
  try {
    const result = await dashboard(user);
    if (ticket !== renderId || main.dataset.page !== 'dashboard') return;
    data = result; drawDashboard(); main.focus({preventScroll:true}); window.scrollTo(0,0);
  } catch (error) {
    if (ticket !== renderId || main.dataset.page !== 'dashboard') return;
    main.innerHTML = `<section class="section-card"><h2>Ruang belajar belum bisa dimuat</h2><p>${escape(message(error))}</p><button class="primary" id="retryDashboard">Coba lagi</button></section>`;
    document.getElementById('retryDashboard').onclick = openDashboard;
  }
}
function drawDashboard() {
  const staff = user.role !== 'murid';
  if (currentTab === 'akun' && user.role !== 'admin') currentTab = 'kelas';
  const quizzes = data.attempts.filter(a=>a.activity==='soal');
  const average = quizzes.length ? `${Math.round(quizzes.reduce((sum,a)=>sum+a.correct/a.total*100,0)/quizzes.length)}%` : '—';
  main.innerHTML = `<div class="dashboard-heading"><div><p class="eyebrow">Ruang ${roles[user.role]}${configured?'':' · Demo'}</p><h1>Halo, ${escape(user.full_name)}!</h1><p class="muted">${staff?'Temani setiap langkah petualangan belajar.':'Siap melanjutkan petualangan iklanmu?'}</p></div><img src="/mascot.svg" alt=""></div>${configured?'':'<div class="notice">Kamu sedang mencoba demo lokal. Perubahan di sini hanya tersimpan di browser ini.</div>'}<div class="stats-grid"><div class="stat"><b>${data.classes.length}</b><span>Kelas${staff?' dikelola':' diikuti'}</span></div><div class="stat"><b>${staff?data.profiles.filter(p=>p.role==='murid').length:data.attempts.length}</b><span>${staff?'Murid':'Aktivitas selesai'}</span></div><div class="stat"><b>${average}</b><span>Rata-rata soal</span></div></div><button class="primary full" id="startLearning">${staff?'Buka kegiatan belajar':'Ayo, lanjut belajar!'} →</button><nav class="portal-tabs" aria-label="Ruang belajar">${[['kelas','Kelas'],['hasil','Hasil belajar'],...(user.role==='admin'?[['akun','Kelola akun']]:[])].map(([id,label])=>`<button data-tab="${id}" ${currentTab===id?'aria-current="page"':''}>${label}</button>`).join('')}</nav><div id="dashboardContent"></div>`;
  document.getElementById('startLearning').onclick = () => window.go('home');
  main.querySelectorAll('[data-tab]').forEach(button => button.onclick = () => {currentTab=button.dataset.tab;drawDashboard();});
  if (currentTab === 'kelas') drawClasses();
  if (currentTab === 'hasil') drawResults();
  if (currentTab === 'akun') drawAccounts();
}
function empty(title, description) { return `<div class="empty-state"><img src="/material.svg" alt=""><b>${title}</b><p>${description}</p></div>`; }
function drawClasses() {
  document.getElementById('dashboardContent').innerHTML = `<section class="section-card"><div class="section-title"><h2>Kelas belajar</h2>${user.role!=='murid'?'<button class="secondary" id="newClass">+ Buat kelas</button>':''}</div>${data.classes.length?data.classes.map(c=>`<article class="class-card"><div><h3>${escape(c.name)}</h3><p>${data.memberships.filter(m=>m.class_id===c.id).length} murid${user.role==='admin'?` · ${escape(data.profiles.find(p=>p.id===c.teacher_id)?.full_name || 'Pengajar')}`:''}</p></div>${user.role!=='murid'?`<button class="secondary" data-add="${escape(c.id)}" style="min-height:38px;padding:8px 11px;font-size:12px">+ Murid</button>`:'<span class="role-badge">Terdaftar</span>'}</article>`).join(''):empty('Belum ada kelas',user.role==='murid'?'Guru akan mendaftarkan akunmu ke kelas.':'Buat kelas pertama, lalu tambahkan akun murid.')}<p class="muted">${user.role==='murid'?'Kamu tetap bisa membuka semua kegiatan belajar.':'Akun murid dibuat oleh guru atau admin, lalu langsung terdaftar di kelas yang dipilih.'}</p></section>${user.role!=='murid'?`<section class="section-card"><h2>Murid di kelasmu</h2>${studentTable()}</section>`:''}`;
  document.getElementById('newClass')?.addEventListener('click', classDialog);
  main.querySelectorAll('[data-add]').forEach(button=>button.onclick=()=>accountDialog(button.dataset.add));
}
function studentTable() {
  const students=data.profiles.filter(p=>p.role==='murid');
  if (!students.length) return empty('Belum ada murid','Tambahkan murid lewat tombol di kelas.');
  return `<div class="table-wrap"><table><thead><tr><th>Nama murid</th><th>Kelas</th><th>Aktivitas</th></tr></thead><tbody>${students.map(p=>`<tr><td>${escape(p.full_name)}</td><td>${data.memberships.filter(m=>m.student_id===p.id).map(m=>escape(data.classes.find(c=>c.id===m.class_id)?.name || '—')).join(', ') || '—'}</td><td>${data.attempts.filter(a=>a.student_id===p.id).length}</td></tr>`).join('')}</tbody></table></div>`;
}
function classDialog() {
  const dialog = modal('Buat kelas belajar', '<form class="form-stack"><label>Nama kelas<input name="name" placeholder="Contoh: Kelas 5A" maxlength="80" required></label><p class="form-error" role="alert"></p><button class="primary" type="submit">Buat kelas</button></form>');
  formSubmit(dialog, async values => { const name=values.name.trim(); if(!name)throw new Error('Nama kelas perlu diisi.'); await createClass(user,name); dialog.close(); notify('Kelas berhasil dibuat.'); openDashboard(); });
}
function accountDialog(classId = '') {
  if (!data.classes.length && user.role==='guru') { notify('Buat kelas terlebih dahulu.'); return; }
  const dialog = modal('Buat akun belajar', `<form class="form-stack"><label>Nama lengkap<input name="full_name" maxlength="100" autocomplete="off" required></label><label>Email akun<input name="email" type="email" maxlength="254" autocomplete="off" required></label><label>Kata sandi awal<input name="password" type="password" minlength="10" autocomplete="new-password" required></label>${user.role==='admin'?'<label>Role<select name="role"><option value="murid">Murid</option><option value="guru">Guru</option></select></label>':'<input type="hidden" name="role" value="murid">'}<label id="classLabel">Kelas<select name="class_id" required><option value="">Pilih kelas</option>${data.classes.map(c=>`<option value="${escape(c.id)}" ${c.id===classId?'selected':''}>${escape(c.name)}</option>`).join('')}</select></label><p class="muted">Minimal 10 karakter untuk kata sandi. Berikan email dan kata sandi awal kepada pemilik akun. Mereka dapat menggantinya di Pengaturan.${configured?'':' Akun demo ini tidak dapat digunakan untuk login sungguhan.'}</p><p class="form-error" role="alert"></p><button class="primary" type="submit">Buat akun</button></form>`);
  dialog.querySelector('select[name="role"]')?.addEventListener('change',event=>{
    const isStudent=event.target.value==='murid'; dialog.querySelector('#classLabel').hidden=!isStudent;
    dialog.querySelector('[name="class_id"]').required=isStudent;
  });
  formSubmit(dialog,async values=>{
    values.full_name=values.full_name.trim(); values.email=values.email.trim();
    if(!values.full_name)throw new Error('Nama lengkap perlu diisi.');
    if(values.role!=='murid')values.class_id=null;
    await createAccount(user,values); dialog.close(); notify('Akun berhasil dibuat.'); openDashboard();
  });
}
function drawAccounts() {
  document.getElementById('dashboardContent').innerHTML = `<section class="section-card"><div class="section-title"><h2>Kelola akun</h2><button class="secondary" id="newAccount">+ Buat akun</button></div><p class="muted">Role hanya dapat diubah admin. Role akun sendiri tidak dapat diubah.</p><input class="field" id="searchAccounts" type="search" placeholder="Cari nama pengguna…" aria-label="Cari pengguna"><div class="table-wrap"><table><thead><tr><th>Nama</th><th>Role</th></tr></thead><tbody id="accountRows"></tbody></table></div></section>`;
  const drawRows = (search='') => {
    const users=data.profiles.filter(p=>p.full_name.toLowerCase().includes(search.toLowerCase()));
    document.getElementById('accountRows').innerHTML = users.map(p=>`<tr><td>${escape(p.full_name)}${p.id===user.id?' (kamu)':''}</td><td><select aria-label="Role ${escape(p.full_name)}" data-role-user="${escape(p.id)}" ${p.id===user.id?'disabled':''}>${Object.entries(roles).map(([r,label])=>`<option value="${r}" ${r===p.role?'selected':''}>${label}</option>`).join('')}</select></td></tr>`).join('') || '<tr><td colspan="2">Tidak ada pengguna yang cocok.</td></tr>';
    main.querySelectorAll('[data-role-user]').forEach(select=>select.onchange=async()=>{
      const profile=data.profiles.find(p=>p.id===select.dataset.roleUser); select.disabled=true;
      try { await changeRole(user,profile.id,select.value); profile.role=select.value; notify('Role diperbarui.'); }
      catch(error){select.value=profile.role;notify(message(error));}
      finally{select.disabled=false;}
    });
  };
  drawRows(); document.getElementById('searchAccounts').oninput=e=>drawRows(e.target.value);
  document.getElementById('newAccount').onclick=()=>accountDialog();
}
function drawResults() {
  document.getElementById('dashboardContent').innerHTML = `<section class="section-card"><div class="section-title"><h2>Hasil belajar</h2><button class="secondary" id="refreshResults">↻ Perbarui</button></div><label class="muted" for="activityFilter">Kegiatan</label><select class="field" id="activityFilter"><option value="">Semua kegiatan</option>${Object.entries(activities).map(([k,v])=>`<option value="${k}">${v}</option>`).join('')}</select><div id="resultRows"></div><p class="muted">Menampilkan hingga 500 hasil terbaru. Game, puzzle, dan materi adalah latihan. Nilai soal pada akun terhubung dihitung di server.</p></section>`;
  const drawRows=(filter='')=>{
    const rows=data.attempts.filter(a=>!filter||a.activity===filter);
    document.getElementById('resultRows').innerHTML=rows.length?`<div class="table-wrap"><table><thead><tr>${user.role!=='murid'?'<th>Murid</th>':''}<th>Kegiatan</th><th>Hasil</th><th>Waktu</th></tr></thead><tbody>${rows.map(a=>`<tr>${user.role!=='murid'?`<td>${escape(data.profiles.find(p=>p.id===a.student_id)?.full_name||'Murid')}</td>`:''}<td>${activities[a.activity]}</td><td>${a.activity==='materi'?'Selesai':`<b>${Math.round(a.correct/a.total*100)}%</b> <small>(${a.correct}/${a.total})</small>`}</td><td>${new Date(a.created_at).toLocaleString('id-ID',{dateStyle:'short',timeStyle:'short',timeZone:'Asia/Jakarta'})}</td></tr>`).join('')}</tbody></table></div>`:empty('Belum ada hasil belajar','Selesaikan kegiatan belajar untuk melihat hasilnya di sini.');
  };
  drawRows(); document.getElementById('activityFilter').onchange=e=>drawRows(e.target.value);
  document.getElementById('refreshResults').onclick=openDashboard;
}

function showSaveStatus() {
  main.querySelector('.save-status')?.remove();
  if (!latestSave || main.dataset.page!==latestSave.activity) return;
  const el=document.createElement('div'); el.className=`save-status${latestSave.error?' error':''}`;el.setAttribute('role','status');
  el.textContent=latestSave.text;
  if(latestSave.error){const button=document.createElement('button');button.textContent='Coba simpan lagi';button.onclick=()=>record(latestSave.detail);el.append(button);}
  main.append(el);
}
async function record(detail) {
  if(!user){latestSave={activity:detail.activity,text:'Masuk sebelum memulai kegiatan agar hasil berikutnya tersimpan.'};showSaveStatus();return;}
  if(user.role!=='murid'){latestSave={activity:detail.activity,text:'Pratinjau pengajar selesai. Hasil ini tidak masuk laporan murid.'};showSaveStatus();return;}
  const owner=user;
  latestSave={activity:detail.activity,text:'Menyimpan hasil belajar…',detail};showSaveStatus();
  pending.set(detail.id,detail);
  try {
    await saveAttempt(owner,detail);
    if(user?.id!==owner.id)return;
    pending.delete(detail.id);
    latestSave={activity:detail.activity,text:configured?'✓ Hasil belajar tersimpan.':'✓ Hasil tersimpan di demo browser ini.',detail};
  } catch(error){
    if(user?.id!==owner.id)return;
    latestSave={activity:detail.activity,text:`Hasil belum tersimpan: ${message(error)}`,error:true,detail};
  }
  showSaveStatus();
}
window.addEventListener('learning:complete',event=>record(event.detail));
window.addEventListener('learning:navigate',()=>{renderId++;strip();showSaveStatus();});
window.addEventListener('online',()=>{for(const detail of pending.values())record(detail);});
document.getElementById('settingsButton').onclick=settings;
if(!configured){const banner=document.createElement('div');banner.className='demo-banner';banner.textContent='Demo website · Coba role admin, guru, dan murid melalui tombol Masuk';document.getElementById('app').prepend(banner);}
if(db){
  const {data:sessionData,error}=await db.auth.getSession();
  if(error)notify('Sesi belum bisa diperiksa. Silakan masuk lagi.');
  if(sessionData?.session){try{user=await profileFor(sessionData.session.user.id);}catch{notify('Profil belum tersedia. Hubungi admin sekolah.');}}
  db.auth.onAuthStateChange((event)=>{if(event==='SIGNED_OUT'){user=null;pending.clear();latestSave=null;window.resetLearningSession?.();window.go('home');}});
}
strip();
