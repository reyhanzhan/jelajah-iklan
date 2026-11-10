import { contentError, loadContent, saveContentItem, deleteContentItem, saveGameSettings, uploadContentImage, readEssays } from './content-data.js';

const names = {questions:'Pilihan Ganda',essays:'Esai',ads:'Pilah Iklan',materials:'Materi',puzzles:'Game Puzzle'};
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let selected = 'questions';
function essayOptions(value) {
  if (Array.isArray(value)) return value;
  if (typeof value !== 'string' || !value.trim()) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}
const fields = {
  questions:[['q','Pertanyaan','textarea'],['o0','Pilihan A'],['o1','Pilihan B'],['o2','Pilihan C'],['o3','Pilihan D'],['a','Jawaban benar','answer'],['explanation','Pembahasan','optional-textarea']],
  essays:[['q','Pertanyaan esai','textarea'],['guidance','Petunjuk untuk murid','optional-textarea'],['keywords','Kata kunci umum (pisahkan dengan koma)','optional-textarea']],
  ads:[['title','Judul iklan'],['icon','Ikon / emoji'],['line','Isi iklan','textarea'],['type','Jenis iklan','category'],['reason','Alasan pengelompokan','textarea']],
  materials:[['title','Judul materi'],['body','Isi materi','textarea'],['image','Gambar pendukung (opsional)','optional-image']],
  puzzles:[['title','Nama poster'],['image','Gambar poster','image'],['type','Jenis iklan','category'],['reason','Alasan jenis iklan','textarea'],['aim','Tujuan iklan â€” jawaban benar'],['wrongAim','Tujuan iklan â€” jawaban pengecoh'],['thirdQuestion','Pertanyaan analisis tambahan','textarea'],['thirdCorrect','Jawaban benar pertanyaan tambahan'],['thirdWrong','Jawaban pengecoh pertanyaan tambahan'],['thirdExplanation','Pembahasan pertanyaan tambahan','textarea']],
};
export function drawContentEditor(container, {modal, notify}) {
  const bank = window.getLearningContent();
  container.innerHTML = `<section class="section-card"><h2>Kelola konten belajar</h2><p class="muted">Admin dan guru dapat memperbarui konten untuk semua murid. Perubahan digunakan saat akun masuk atau konten dimuat ulang. Jumlah kartu Pilah Iklan dapat diatur sendiri, dengan komposisi jenis iklan bebas.</p>${contentError?`<div class="notice" role="status">${escape(contentError)}</div>`:''}<div class="content-toolbar"><label>Kategori<select class="field" id="contentKind">${Object.entries(names).map(([key,label])=>`<option value="${key}" ${key===selected?'selected':''}>${label}</option>`).join('')}</select></label><button class="secondary" id="reloadContent">Muat ulang</button><button class="primary" id="addContent" ${contentError?'disabled':''}>+ Tambah</button></div><p class="muted">${bank[selected].length} konten dalam kategori ${names[selected]}</p><div class="content-list">${bank[selected].map((item,i)=>`<article class="content-row"><div><b>${i+1}. ${escape(item.title||item.q)}</b><small>${escape(item.type ? (item.type==='komersial'?'Komersial':'Nonkomersial') : item.body?.slice(0,100)||item.line||'')}</small></div><div class="content-row-actions"><button class="secondary" data-edit-content="${i}" ${contentError?'disabled':''}>Edit</button><button class="secondary danger" data-delete-content="${i}" ${contentError?'disabled':''}>Hapus</button></div></article>`).join('')||'<p>Belum ada konten. Tambahkan yang pertama.</p>'}</div></section>`;
  container.querySelector('#contentKind').onchange=event=>{selected=event.target.value;drawContentEditor(container,{modal,notify});};
  container.querySelector('#reloadContent').onclick=async event=>{
    event.target.disabled=true;
    await loadContent();
    if(container.isConnected)drawContentEditor(container,{modal,notify});
  };
  container.querySelector('#addContent').onclick=()=>edit(null);
  if(selected==='ads'){
    const settings=document.createElement('form');settings.className='form-stack section-card';settings.id='gameSettings';
    settings.innerHTML=`<h3>Atur permainan Pilah Iklan</h3><label>Jumlah kartu per permainan<input name="adCount" type="number" min="1" max="1000" step="1" value="${bank.settings.adCount}" required></label><p class="muted">Kartu diambil acak tanpa kuota jenis iklan. Tersedia ${bank.ads.length} kartu; permainan memakai maksimal jumlah yang tersedia. Semua jawaban benar tetap bernilai 100.</p><p class="form-error" role="alert"></p><button type="submit" class="primary" ${contentError?'disabled':''}>Simpan pengaturan</button>`;
    container.querySelector('.content-list').before(settings);
    settings.onsubmit=async event=>{
      event.preventDefault();const button=settings.querySelector('button');button.disabled=true;
      try{await saveGameSettings(Number(settings.elements.adCount.value));notify('Pengaturan permainan tersimpan.');if(container.isConnected)drawContentEditor(container,{modal,notify});}
      catch(error){settings.querySelector('.form-error').textContent=error.message;}
      finally{button.disabled=false;}
    };
  }
  container.querySelectorAll('[data-edit-content]').forEach(button=>button.onclick=()=>edit(Number(button.dataset.editContent)));
  container.querySelectorAll('[data-delete-content]').forEach(button=>button.onclick=()=>remove(Number(button.dataset.deleteContent)));
  function remove(index) {
    const kind=selected,item=bank[kind][index];
    const dialog=modal(`Hapus ${names[kind]}?`, `<p>Hapus <b>${escape(item.title||item.q)}</b> dari konten belajar semua kelas?</p><p class="muted">Hasil belajar dan versi soal yang sedang dikerjakan murid tetap tersimpan.</p><p class="form-error" role="alert"></p><div class="actions"><button type="button" class="secondary" id="cancelDeleteContent">Batal</button><button type="button" class="primary danger" id="confirmDeleteContent">Ya, hapus konten</button></div>`);
    dialog.querySelector('#cancelDeleteContent').onclick=()=>dialog.close();
    dialog.querySelector('#cancelDeleteContent').focus();
    dialog.querySelector('#confirmDeleteContent').onclick=async event=>{
      const button=event.target;button.disabled=true;
      try{
        await deleteContentItem(kind,index);
        dialog.close();notify('Konten berhasil dihapus.');
        if(container.isConnected)drawContentEditor(container,{modal,notify});
      }catch(error){dialog.querySelector('.form-error').textContent=error.message;}
      finally{button.disabled=false;}
    };
  }
  function edit(index) {
    const kind=selected;
    const item=index===null?{icon:'ðŸ“£',type:'komersial',a:0}:bank[kind][index];
    const values={...item,...Object.fromEntries((item.o||[]).map((value,i)=>['o'+i,value]))};
    if(kind==='essays')values.keywords=Array.isArray(values.keywords)?values.keywords.join(', '):values.keywords;
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
    const savedOptions=kind==='essays'?essayOptions(values.imageOptions):[];
    const optionFields=kind==='essays'?`<fieldset class="essay-options-editor"><legend>Pilihan gambar (opsional, maksimal 3)</legend><p class="muted">Isi gambar dan soal analisis untuk setiap pilihan. Murid hanya dapat memilih satu gambar.</p>${[0,1,2].map(i=>{
      const option=savedOptions[i]||{};
      const image=option.image||option.url||option.src||'';
      return `<fieldset class="essay-option-editor"><legend>Gambar ${i+1}</legend><label>Nama gambar<input name="option${i}Title" value="${escape(option.title||'')}" maxlength="100" placeholder="Contoh: Poster hemat air"></label><label>Gambar<input name="option${i}Image" value="${escape(image)}" maxlength="2000" placeholder="Tempel alamat gambar HTTPS"></label><label class="image-upload">Atau unggah gambar<input type="file" name="option${i}File" accept="image/png,image/jpeg,image/webp"></label><img class="content-image-preview option-image-preview" data-option-preview="${i}" alt="Pratinjau gambar ${i+1}" ${image?'src="'+escape(image)+'"':'hidden'}><label>Soal analisis untuk gambar ini<textarea name="option${i}Question" rows="2" maxlength="4000" placeholder="Contoh: Apa ajakan pada poster ini?">${escape(option.question||'')}</textarea></label><label>Kata kunci untuk gambar ini<input name="option${i}Keywords" value="${escape(Array.isArray(option.keywords)?option.keywords.join(', '):option.keywords||'')}" maxlength="1000" placeholder="Contoh: hemat air, keran"></label><input type="hidden" name="option${i}Id" value="${escape(option.id||`essay-image-${i+1}`)}"></fieldset>`;
    }).join('')}</fieldset>`:'';
    const dialog=modal(`${index===null?'Tambah':'Edit'} ${names[kind]}`,`<form class="form-stack content-form">${formFields}${optionFields}<p class="muted">Simpan untuk menerbitkan perubahan ke semua murid.</p><p class="form-error" role="alert"></p><div class="actions"><button type="button" class="secondary" id="cancelContent">Batal</button><button class="primary" type="submit">Simpan konten</button></div></form>`);
    const form=dialog.querySelector('form'),error=dialog.querySelector('.form-error'),submit=form.querySelector('[type="submit"]');
    dialog.querySelector('#cancelContent').onclick=()=>dialog.close();
    const imageField=form.querySelector('[name="image"]'),upload=form.querySelector('#contentImageFile');
    const preview=()=>{const img=form.querySelector('#contentImagePreview');img.hidden=!imageField.value;if(imageField.value)img.src=imageField.value;};
    if(imageField){preview();imageField.onchange=preview;}
    if(kind==='essays')for(let i=0;i<3;i++){
      const imageInput=form.elements[`option${i}Image`],fileInput=form.elements[`option${i}File`],imagePreview=form.querySelector(`[data-option-preview="${i}"]`);
      imageInput.oninput=()=>{imagePreview.hidden=!imageInput.value;if(imageInput.value)imagePreview.src=imageInput.value;};
      fileInput.onchange=()=>{const file=fileInput.files[0];if(!file)return;imagePreview.src=URL.createObjectURL(file);imagePreview.hidden=false;};
    }
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
        if(kind==='essays'){
          updated.keywords = String(updated.keywords || '').split(',').map(item=>item.trim()).filter(Boolean);
          const imageOptions=[];
          for(let i=0;i<3;i++){
            let image=String(updated[`option${i}Image`]||'');
            const file=form.elements[`option${i}File`].files[0];
            if(file)image=await uploadContentImage(file);
            const title=String(updated[`option${i}Title`]||'');
            const question=String(updated[`option${i}Question`]||'');
            const keywords=String(updated[`option${i}Keywords`]||'').split(',').map(value=>value.trim()).filter(Boolean);
            const configured=Boolean(title||image||question||keywords.length||file);
            if(configured && (!title||!image||!question))throw new Error(`Lengkapi nama, gambar, dan soal analisis pada Gambar ${i+1}, atau kosongkan seluruh bagiannya.`);
            if(configured)imageOptions.push({id:String(updated[`option${i}Id`]||`essay-image-${i+1}`),title,image,question,keywords});
            for(const key of [`option${i}Title`,`option${i}Image`,`option${i}Question`,`option${i}Keywords`,`option${i}Id`,`option${i}File`])delete updated[key];
          }
          if(imageOptions.length)updated.imageOptions=imageOptions;
          else delete updated.imageOptions;
        }
        await saveContentItem(kind,index,updated);
        dialog.close();notify('Konten berhasil disimpan.');
        if(container.isConnected)drawContentEditor(container,{modal,notify});
      }catch(e){error.textContent=e.message;}
      finally{submit.disabled=false;}
    };
  }
}
export async function drawEssayResults(container, profiles) {
  container.innerHTML='<p role="status">Memuat jawaban esaiâ€¦</p>';
  try{
    const rows=await readEssays();
    if(!container.isConnected)return;
    container.innerHTML=`<section class="section-card"><h2>Jawaban esai</h2><p class="muted">Jawaban esai dibaca oleh pengajar; belum diberi nilai otomatis. Menampilkan 100 kiriman terbaru.</p>${rows.map(row=>`<details class="essay-result"><summary>${escape(profiles.find(p=>p.id===row.student_id)?.full_name||'Murid')}, ${new Date(row.created_at).toLocaleString('id-ID')}</summary>${row.answers.map((answer,i)=>{const keywords=(Array.isArray(answer.keywords)?answer.keywords:[]).filter(Boolean);const matched=Array.isArray(answer.matchedKeywords)?answer.matchedKeywords:[];const imageInfo=answer.selectedImage?`<p class="muted">Gambar dipilih: ${escape(answer.selectedImage)}</p>`:'';const keywordInfo=keywords.length?`<p class="muted">Kata kunci: ${escape(keywords.join(', '))}${matched.length?`. Terdeteksi ${matched.length}/${keywords.length}`:''}</p>`:'';return `<p><b>${i+1}. ${escape(answer.q)}</b></p>${imageInfo}${keywordInfo}<p class="content-prose">${escape(answer.answer)}</p>`;}).join('')}</details>`).join('')||'<p>Belum ada jawaban esai.</p>'}</section>`;
  }catch{container.innerHTML='<div class="notice">Jawaban esai belum dapat dimuat. Periksa koneksi dan pemasangan bank konten.</div>';}
}
