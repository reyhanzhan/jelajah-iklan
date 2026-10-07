-- Bank soal dari APK Jelajah Iklan. Jalankan setelah schema.sql.
insert into public.quiz_keys (id, answers) values (1, '[1,2,1,3,2,0,2,1,2,3,2,0,2,1,2,0,2,1,3,1,1,1,2,1,1]'::jsonb)
on conflict (id) do update set answers=excluded.answers;
