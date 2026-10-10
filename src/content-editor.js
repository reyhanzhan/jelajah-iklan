import { contentError, loadContent, saveContentItem, uploadContentImage, readEssays } from './content-data.js';

const names = {questions:'Pilihan Ganda',essays:'Esai',ads:'Pilah Iklan',materials:'Materi',puzzles:'Game Puzzle'};
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let selected = 'questions';
const fields = {
  questions:[['q','Pertanyaan','textarea'],['o0','Pilihan A'],['o1','Pilihan B'],['o2','Pilihan C'],['o3','Pilihan D'],['a','Jawaban benar','answer'],['explanation','Pembahasan','optional-textarea']],
  essays:[['q','Pertanyaan esai','textarea'],['guidance','Petunjuk untuk murid','optional-textarea']],
  ads:[['title','Judul iklan'],['icon','Ikon / emoji'],['line','Isi iklan','textarea'],['type','Jenis iklan','category'],['reason','Alasan pengelompokan','textarea']],
  materials:[['title','Judul materi'],['body','Isi materi','textarea'],['image','Gambar pendukung (opsional)','optional-image']],
  puzzles:[['title','Nama poster'],['image','Gambar poster','image'],['type','Jenis iklan','category'],['reason','Alasan jenis iklan','textarea'],['aim','Tujuan iklan — jawaban benar'],['wrongAim','Tujuan iklan — jawaban pengecoh'],['thirdQuestion','Pertanyaan analisis tambahan','textarea'],['thirdCorrect','Jawaban benar pertanyaan tambahan'],['thirdWrong','Jawaban pengecoh pertanyaan tambahan'],['thirdExplanation','Pembahasan pertanyaan tambahan','textarea']],
};
export function drawContentEditor(container, {modal, notify}) {
  const bank = window.getLearningContent();
  container.innerHTML = `<section class="section-card"><h2>Kelola konten belajar</h2><p class="muted">Admin dan guru dapat memperbarui konten untuk semua murid. Perubahan digunakan saat akun masuk atau konten dimuat ulang. Pilah Iklan tetap mengambil 10 kartu komersial dan 10 nonkomersial.</p>${contentError?`<div class="notice" role="status">${escape(contentError)}</div>`:''}<div class="content-toolbar"><label>Kategori<select class="field" id="contentKind">${Object.entries(names).map(([key,label])=>`<option value="${key}" ${key===selected?'selected':''}>${label}</option>`).join('')}</select></label><button class="secondary" id="reloadContent">Muat ulang</button><button class="primary" id="addContent" ${contentError?'disabled':''}>+ Tambah</button></div><p class="muted">${bank[selected].length} konten · ${names[selected]}</p><div class="content-list">${bank[selected].map((item,i)=>`<article class="content-row"><div><b>${i+1}. ${escape(item.title||item.q)}</b><small>${escape(item.type ? (item.type==='komersial'?'Komersial':'Nonkomersial') : item.body?.slice(0,100)||item.line||'')}</small></div><button class="secondary" data-edit-content="${i}" ${contentError?'disabled':''}>Edit</button></article>`).join('')||'<p>Belum ada konten. Tambahkan yang pertama.</p>'}</div></section>`;
  container.querySelector('#contentKind').onchange=event=>{selected=event.target.value;drawContentEditor(container,{modal,notify});};
  container.querySelector('#reloadContent').onclick=async event=>{
    event.target.disabled=true;
    await loadContent();
    if(container.isConnected)drawContentEditor(container,{modal,notify});
  };
  container.querySelector('#addContent').onclick=()=>edit(null);
  container.querySelectorAll('[data-edit-content]').forEach(button=>button.onclick=()=>edit(Number(button.dataset.editContent)));
  function edit(index) {
    const kind=selected;
    const item=index===null?{icon:'📣',type:'komersial',a:0}:bank[kind][index];
    const values={...item,...Object.fromEntries((item.o||[]).map((value,i)=>['o'+i,value]))};
    const formFields=fields[kind].map(([name,label,type='text'])=>{
      const value=values[name]??'';
      const required=type.startsWith('optional')?'':'required';
      let input;
      if(type==='category')input=`<select name="${name}"><option value="komersial" ${value==='komersial'?'selected':''}>Komersial</option><option value="nonkomersial" ${value==='nonkomersial'?'selected':''}>Nonkomersial</option></select>`;
      else if(type==='answer')input=`<select name="a">${['A','B','C','D'].map((label,i)=>`<option value="${i}" ${Number(value)===i?'selected':''}>${label}</option>`).join('')}</select>`;
      else if(type.includes('textarea'))input=`<textarea name="${name}" rows="${name==='body'?10:3}" maxlength="${name==='body'?20000:4000}" ${required}>${escape(value)}</textarea>`;
      else input=`<input name="${name}" value="${escape(value)}" maxlength="${type.includes('image')?2000:1000}" ${required}>`;
      return `<label>${label}${input}</label>${type.includes('image')?'<label class="image-upload">Atau unggah gambar<input type="file" id="contentImageFile" accept="image/png,image/jpeg,image/webp"></label><small class="muted">JPG, PNG, atau WebP, maksimal 5 MB. Anda juga bisa menempelkan URL gambar HTTPS.</small><img id="contentImagePreview" class="content-image-preview" alt="Pratinjau gambar" hidden>':''}`;
    }).join('');
    const dialog=modal(`${index===null?'Tambah':'Edit'} ${names[kind]}`,`<form class="form-stack content-form">${formFields}<p class="muted">Simpan untuk menerbitkan perubahan ke semua murid.</p><p class="form-error" role="alert"></p><div class="actions"><button type="button" class="secondary" id="cancelContent">Batal</button><button class="primary" type="submit">Simpan konten</button></div></form>`);
    const form=dialog.querySelector('form'),error=dialog.querySelector('.form-error'),submit=form.querySelector('[type="submit"]');
    dialog.querySelector('#cancelContent').onclick=()=>dialog.close();
    const imageField=form.querySelector('[name="image"]'),upload=form.querySelector('#contentImageFile');
    const preview=()=>{const img=form.querySelector('#contentImagePreview');img.hidden=!imageField.value;if(imageField.value)img.src=imageField.value;};
    if(imageField){preview();imageField.onchange=preview;}
    if(upload)upload.onchange=async()=>{
      if(!upload.files[0])return;
      submit.disabled=true;upload.disabled=true;error.textContent='';
      try{imageField.value=await uploadContentImage(upload.files[0]);preview();}
      catch(e){error.textContent=e.message;}
      finally{submit.disabled=false;upload.disabled=false;}
    };
    form.onsubmit=async event=>{
      event.preventDefault();submit.disabled=true;error.textContent='';
      try{
        const updated=Object.fromEntries([...new FormData(form)].map(([key,value])=>[key,typeof value==='string'?value.trim():value]));
        if(kind==='questions'){updated.o=[0,1,2,3].map(i=>updated['o'+i]);for(let i=0;i<4;i++)delete updated['o'+i];updated.a=Number(updated.a);}
        await saveContentItem(kind,index,updated);
        dialog.close();notify('Konten berhasil disimpan.');
        if(container.isConnected)drawContentEditor(container,{modal,notify});
      }catch(e){error.textContent=e.message;}
      finally{submit.disabled=false;}
    };
  }
}
export async function drawEssayResults(container, profiles) {
  container.innerHTML='<p role="status">Memuat jawaban esai…</p>';
  try{
    const rows=await readEssays();
    if(!container.isConnected)return;
    container.innerHTML=`<section class="section-card"><h2>Jawaban esai</h2><p class="muted">Jawaban esai dibaca oleh pengajar; belum diberi nilai otomatis. Menampilkan 100 kiriman terbaru.</p>${rows.map(row=>`<details class="essay-result"><summary>${escape(profiles.find(p=>p.id===row.student_id)?.full_name||'Murid')} · ${new Date(row.created_at).toLocaleString('id-ID')}</summary>${row.answers.map((answer,i)=>`<p><b>${i+1}. ${escape(answer.q)}</b></p><p class="content-prose">${escape(answer.answer)}</p>`).join('')}</details>`).join('')||'<p>Belum ada jawaban esai.</p>'}</section>`;
  }catch{container.innerHTML='<div class="notice">Jawaban esai belum dapat dimuat. Periksa koneksi dan pemasangan bank konten.</div>';}
}
