import { db } from './data.js';

export let contentRevision = null;
export let contentError = '';
export async function loadContent() {
  try {
    const { data, error } = await db.rpc('get_learning_content');
    if (error) throw error;
    if (!data) throw new Error('Bank konten belum diisi.');
    window.applyLearningContent(data.data, data.id);
    contentRevision = data.id;
    contentError = '';
    return data;
  } catch (error) {
    contentError = ['PGRST202','42P01'].includes(error.code)
      ? 'Bank konten belum diaktifkan. Jalankan query supabase/content-management.sql di SQL Editor Supabase, lalu klik Muat ulang.'
      : 'Bank konten belum bisa dimuat. Periksa koneksi lalu klik Muat ulang.';
    return null;
  }
}
export function resetContent() { contentRevision = null; contentError = ''; window.restoreLearningDefaults(); }
export async function saveContentItem(kind, index, item) {
  const { data, error } = await db.rpc('save_learning_item', {
    content_kind: kind, item_index: index, item_data: item, expected_revision: contentRevision,
  });
  if (error) throw new Error(error.message);
  window.applyLearningContent(data.data, data.id);
  contentRevision = data.id;
  return data;
}
export async function uploadContentImage(file) {
  const extensions = {'image/jpeg':'jpg','image/png':'png','image/webp':'webp'};
  if (!extensions[file.type] || file.size > 5 * 1024 * 1024) throw new Error('Gunakan gambar JPG, PNG, atau WebP, maksimal 5 MB.');
  const path = `${crypto.randomUUID()}.${extensions[file.type]}`;
  const { error } = await db.storage.from('learning-images').upload(path, file, {contentType:file.type});
  if (error) throw new Error('Gambar belum terunggah. Periksa koneksi dan pemasangan query bank konten.');
  return db.storage.from('learning-images').getPublicUrl(path).data.publicUrl;
}
export async function saveEssay(detail) {
  const { error } = await db.rpc('submit_learning_essay', {event_id:detail.id, content_revision:detail.revision, responses:detail.answers});
  if (error) throw error;
}
export async function readEssays() {
  const { data, error } = await db.from('essay_submissions').select('*').order('created_at', {ascending:false}).limit(100);
  if (error) throw error;
  return data;
}
