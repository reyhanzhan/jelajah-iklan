import fs from 'node:fs';
import vm from 'node:vm';
// public/app.js is now the maintained application source. Never overwrite it
// with the APK reference: that would discard the newer learning flows.
const original = fs.readFileSync('public/app.js','utf8');
// Synchronize the current multiple-choice answer bank with PostgreSQL.
const start=original.indexOf('const questions = [');
const end=original.indexOf('\nquizAnswers =',start);
const bank=vm.runInNewContext(original.slice(start,end)+'; questions');
fs.writeFileSync('supabase/seed.sql',`-- Bank soal dari APK Jelajah Iklan. Jalankan setelah schema.sql.\ninsert into public.quiz_keys (id, answers) values (1, '${JSON.stringify(bank.map(q=>q.a))}'::jsonb)\non conflict (id) do update set answers=excluded.answers;\n`);
