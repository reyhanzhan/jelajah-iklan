import { createClient } from 'npm:@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {status, headers:{...cors,'Content-Type':'application/json'}});

Deno.serve(async (request: Request) => {
  if (request.method === 'OPTIONS') return new Response('ok', {headers:cors});
  if (request.method !== 'POST') return json({error:'Metode tidak didukung.'},405);
  const token = request.headers.get('Authorization')?.replace(/^Bearer\s+/i,'');
  if (!token) return json({error:'Silakan masuk terlebih dahulu.'},401);
  const secretKeys = JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') || '{}');
  const admin = createClient(Deno.env.get('SUPABASE_URL')!,secretKeys.default || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {auth:{persistSession:false,autoRefreshToken:false}});
  const {data:{user},error:authError} = await admin.auth.getUser(token);
  if (authError || !user) return json({error:'Sesi tidak valid. Silakan masuk kembali.'},401);
  const {data:actor} = await admin.from('profiles').select('role').eq('id',user.id).single();
  if (!actor || !['admin','guru'].includes(actor.role)) return json({error:'Hanya admin dan guru dapat membuat akun.'},403);
  let payload;
  try { payload=await request.json(); } catch { return json({error:'Data tidak valid.'},400); }
  if (!payload || typeof payload!=='object' || Array.isArray(payload)) return json({error:'Data tidak valid.'},400);
  const action=payload.action ?? 'create';
  if (!['create','update','delete'].includes(action)) return json({error:'Tindakan tidak valid.'},400);
  if (action!=='create') {
    if (typeof payload.id!=='string' || !/^[0-9a-f-]{36}$/i.test(payload.id)) return json({error:'ID akun tidak valid.'},400);
    const {data:target,error:targetError}=await admin.from('profiles').select('id,role,email').eq('id',payload.id).single();
    if(targetError || !target) return json({error:'Profil belum tersedia. Pastikan SQL account-management.sql sudah dijalankan.'},400);
    if(actor.role==='guru') {
      if(target.role!=='murid') return json({error:'Guru hanya dapat mengelola akun murid.'},403);
      const {data:memberships,error}=await admin.from('memberships').select('classes!inner(teacher_id)').eq('student_id',target.id);
      if(error) return json({error:'Keanggotaan kelas belum dapat diperiksa.'},500);
      // Perubahan akun berlaku untuk semua kelas; murid lintas pengajar dikelola admin.
      if(!memberships?.length || memberships.some((m:any)=>m.classes.teacher_id!==user.id)) return json({error:'Akun ini berada di luar kelas Anda atau memiliki pengajar lain. Minta admin mengelolanya.'},403);
    }
    if(action==='delete') {
      if(target.id===user.id || target.role==='admin') return json({error:'Akun sendiri dan akun admin tidak dapat dihapus.'},403);
      const {data:classes,error}=await admin.from('classes').select('id').eq('teacher_id',target.id);
      if(error) return json({error:'Kelas pengajar belum dapat diperiksa.'},500);
      if(classes?.length) return json({error:'Pindahkan pengajar melalui Edit kelas sebelum menghapus akun guru ini.'},409);
      const {error:deleteError}=await admin.auth.admin.deleteUser(target.id);
      if(deleteError) return json({error:'Akun gagal dihapus. Periksa data terkait atau kepemilikan berkas di Supabase.'},400);
      return json({id:target.id});
    }
    const {full_name,email,password}=payload;
    if(typeof full_name!=='string' || !full_name.trim() || full_name.trim().length>100 || typeof email!=='string' || email.length>254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || (password!==undefined && (typeof password!=='string' || password.length>128))) return json({error:'Periksa nama, email, dan kata sandi (maksimal 128 karakter).'},400);
    // Trigger SQL menyinkronkan nama/email dalam transaksi perubahan Auth yang sama.
    const {error:updateError}=await admin.auth.admin.updateUserById(target.id,{
      email:email.trim().toLowerCase(),email_confirm:true,user_metadata:{full_name:full_name.trim()},...(password?{password}:{})
    });
    if(updateError) {
      if(['email_exists','user_already_exists'].includes(updateError.code || '')) return json({error:'Email ini sudah digunakan akun lain.'},409);
      if(updateError.code==='weak_password' || /password/i.test(updateError.message)) return json({error:'Kata sandi belum memenuhi aturan sandi Supabase. '+updateError.message},400);
      return json({error:'Perubahan akun gagal. Periksa log create-account di Supabase.'},400);
    }
    return json({id:target.id});
  }
  const {full_name,email,password,role,class_id}=payload;
  if (typeof full_name!=='string' || !full_name.trim() || full_name.trim().length>100 || typeof email!=='string' || email.length>254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || typeof password!=='string' || !password.length || password.length>128 || !['murid','guru'].includes(role)) return json({error:'Lengkapi nama, email, role, dan kata sandi (maksimal 128 karakter).'},400);
  if (role==='guru' && actor.role!=='admin') return json({error:'Hanya admin dapat membuat akun guru.'},403);
  if (role==='murid') {
    if (typeof class_id!=='string') return json({error:'Pilih kelas untuk murid.'},400);
    const {data:classroom}=await admin.from('classes').select('teacher_id').eq('id',class_id).single();
    if (!classroom || (actor.role==='guru' && classroom.teacher_id!==user.id)) return json({error:'Kelas tidak ditemukan atau bukan kelas Anda.'},403);
  }
  const {data:created,error:createError}=await admin.auth.admin.createUser({
    email:email.trim().toLowerCase(),password,email_confirm:true,
    user_metadata:{full_name:full_name.trim()},app_metadata:{provisioned:true},
  });
  if(createError || !created.user) {
    if(['email_exists','user_already_exists'].includes(createError?.code || '')) return json({error:'Email ini sudah digunakan. Masukkan email lain untuk akun murid/guru yang baru.'},409);
    if(createError?.code==='weak_password' || /password/i.test(createError?.message || '')) {
      const minimum=createError?.message.match(/at least (\d+) characters/i)?.[1];
      return json({error:minimum?`Kata sandi minimal ${minimum} karakter sesuai pengaturan akun sekolah.`:'Kata sandi belum memenuhi pengaturan akun sekolah. Coba kata sandi lain atau minta admin memeriksa aturan sandi di Supabase.'},400);
    }
    return json({error:'Akun gagal dibuat oleh layanan autentikasi. Periksa pemasangan profil akun dan log create-account di Supabase.'},400);
  }
  try {
    // Profil awal selalu murid. Role guru hanya diset setelah otorisasi di atas.
    if(role==='guru') { const {error}=await admin.from('profiles').update({role:'guru'}).eq('id',created.user.id);if(error)throw error; }
    if(role==='murid') { const {error}=await admin.from('memberships').insert({class_id,student_id:created.user.id});if(error)throw error; }
    return json({id:created.user.id});
  } catch {
    const {error:cleanupError}=await admin.auth.admin.deleteUser(created.user.id);
    if(cleanupError) return json({error:'Pendaftaran kelas gagal dan akun belum dapat dibersihkan. Hubungi admin sebelum mencoba lagi.'},500);
    return json({error:'Pendaftaran kelas gagal; akun dibatalkan. Silakan coba lagi.'},500);
  }
});
