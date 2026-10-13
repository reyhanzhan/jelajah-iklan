import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
export const db = url && key ? createClient(url, key) : null;
export const configured = !!db;
const initialEmails = {admin:'admin@jelajah-iklan.test',guru:'guru@jelajah-iklan.test',siswa:'siswa@jelajah-iklan.test'};
export function loginEmail(value) {
  const identifier = value.trim().toLowerCase();
  return initialEmails[identifier] || identifier;
}
function client() {
  if (!db) throw new Error('Layanan akun belum terhubung. Hubungi admin sekolah.');
  return db;
}
function checked(result) { if (result.error) throw result.error; return result.data; }
export async function profileFor(id) { return checked(await client().from('profiles').select('*').eq('id', id).single()); }
export async function dashboard() {
  const supabase = client();
  const results = await Promise.all([
    supabase.from('classes').select('*').order('created_at'),
    supabase.from('profiles').select('*').order('full_name'),
    supabase.from('memberships').select('*'),
    supabase.from('attempts').select('*').order('created_at', {ascending:false}).limit(500)
  ]);
  return Object.fromEntries(['classes','profiles','memberships','attempts'].map((k,i) => [k,checked(results[i])]));
}
export async function createClass(user, name) {
  return checked(await client().from('classes').insert({name,teacher_id:user.id}));
}
export async function manageClass(values) {
  const result=await client().rpc('manage_class',values);
  if(result.error?.code==='PGRST202') throw new Error('Fitur kelas belum terpasang. Jalankan account-management.sql di SQL Editor Supabase.');
  return checked(result);
}
export async function createAccount(user, values) {
  const result = await client().functions.invoke('create-account', {body:values});
  if (result.error) {
    let details;
    try { details = await result.error.context.json(); } catch {}
    const status=result.error.context?.status;
    if(status===404 || details?.code==='NOT_FOUND') throw new Error('Layanan pembuatan akun belum terpasang. Admin perlu deploy Edge Function create-account di Supabase terlebih dahulu.');
    if(details?.error) throw new Error(details.error);
    if(status===401) throw new Error('Sesi tidak valid atau kedaluwarsa. Keluar lalu masuk kembali sebelum membuat akun.');
    if(status===403) throw new Error('Akses ditolak. Hanya admin atau guru pengelola kelas yang dapat membuat akun ini.');
    if(result.error.name==='FunctionsFetchError') throw new Error('Layanan pembuatan akun tidak dapat dihubungi. Periksa koneksi dan pastikan Edge Function create-account sudah di-deploy di Supabase.');
    throw new Error('Layanan pembuatan akun sedang bermasalah. Admin dapat memeriksa log create-account di Supabase.');
  }
  if (result.data?.error) throw new Error(result.data.error);
  return result.data;
}
export async function changeRole(user, id, role) {
  return checked(await client().rpc('set_user_role', {target_id:id,new_role:role}));
}
export async function saveAttempt(user, detail) {
  return checked(await client().rpc(detail.revision ? 'record_content_attempt' : 'record_attempt', {event_id:detail.id,activity:detail.activity,correct_count:detail.correct,total_count:detail.total,submitted_answers:detail.answers || null,...(detail.revision?{content_revision:detail.revision}:{})}));
}
