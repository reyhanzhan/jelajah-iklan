import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
export const db = url && key ? createClient(url, key) : null;
export const configured = !!db;
const storageKey = 'jelajah-demo-v1';
const initial = () => ({
  profiles: [{id:'demo-admin',full_name:'Admin Demo',role:'admin'},{id:'demo-guru',full_name:'Bu Guru Demo',role:'guru'},{id:'demo-murid',full_name:'Murid Demo',role:'murid'}],
  classes: [{id:'demo-class',name:'Kelas 5 · Detektif Iklan',teacher_id:'demo-guru'}],
  memberships: [{class_id:'demo-class',student_id:'demo-murid'}], attempts: []
});
let demo;
try { demo = JSON.parse(localStorage.getItem(storageKey)) || initial(); if (!Array.isArray(demo.profiles) || !Array.isArray(demo.classes) || !Array.isArray(demo.memberships) || !Array.isArray(demo.attempts)) demo = initial(); } catch { demo = initial(); }
function persist() { try { localStorage.setItem(storageKey, JSON.stringify(demo)); } catch { throw new Error('Penyimpanan browser penuh atau tidak tersedia.'); } }
function checked(result) { if (result.error) throw result.error; return result.data; }
export const demoUser = role => demo.profiles.find(p => p.id === `demo-${role}`);
export async function profileFor(id) { return checked(await db.from('profiles').select('*').eq('id', id).single()); }
export async function dashboard(user) {
  if (!db) {
    const classes = demo.classes.filter(c => user.role === 'admin' || (user.role === 'guru' ? c.teacher_id === user.id : demo.memberships.some(m => m.student_id === user.id && m.class_id === c.id)));
    const students = new Set(demo.memberships.filter(m => classes.some(c => c.id === m.class_id)).map(m => m.student_id));
    return {classes, profiles: demo.profiles.filter(p => user.role === 'admin' || p.id === user.id || (user.role === 'guru' && students.has(p.id))), memberships: demo.memberships.filter(m => classes.some(c => c.id === m.class_id)), attempts: demo.attempts.filter(a => user.role === 'admin' || a.student_id === user.id || (user.role === 'guru' && students.has(a.student_id))).slice().reverse()};
  }
  const results = await Promise.all([
    db.from('classes').select('*').order('created_at'),
    db.from('profiles').select('*').order('full_name'),
    db.from('memberships').select('*'),
    db.from('attempts').select('*').order('created_at', {ascending:false}).limit(500)
  ]);
  return Object.fromEntries(['classes','profiles','memberships','attempts'].map((k,i) => [k,checked(results[i])]));
}
export async function createClass(user, name) {
  if (db) return checked(await db.from('classes').insert({name,teacher_id:user.id}));
  demo.classes.push({id:crypto.randomUUID(),name,teacher_id:user.id}); persist();
}
export async function createAccount(user, values) {
  if (db) {
    const result = await db.functions.invoke('create-account', {body:values});
    if (result.error) {
      let message;
      try { message = (await result.error.context.json()).error; } catch {}
      throw new Error(message || 'Pembuatan akun gagal. Periksa koneksi dan pemasangan fungsi create-account.');
    }
    if (result.data?.error) throw new Error(result.data.error);
    return result.data;
  }
  if (user.role === 'murid' || (user.role === 'guru' && values.role !== 'murid')) throw new Error('Akses ditolak.');
  const p = {id:crypto.randomUUID(),full_name:values.full_name,role:values.role};
  demo.profiles.push(p);
  if (values.class_id) demo.memberships.push({class_id:values.class_id,student_id:p.id});
  persist();
}
export async function changeRole(user, id, role) {
  if (db) return checked(await db.rpc('set_user_role', {target_id:id,new_role:role}));
  if (user.role !== 'admin' || user.id === id) throw new Error('Role akun sendiri tidak dapat diubah.');
  if (demo.classes.some(c => c.teacher_id === id) && role === 'murid') throw new Error('Akun ini masih mengajar kelas.');
  demo.profiles.find(p => p.id === id).role = role; persist();
}
export async function saveAttempt(user, detail) {
  if (db) return checked(await db.rpc('record_attempt', {event_id:detail.id,activity:detail.activity,correct_count:detail.correct,total_count:detail.total,submitted_answers:detail.answers || null}));
  if (!demo.attempts.some(a => a.id === detail.id)) {
    demo.attempts.push({id:detail.id,student_id:user.id,activity:detail.activity,correct:detail.correct,total:detail.total,created_at:new Date().toISOString()}); persist();
  }
}
