import fs from 'node:fs';
import vm from 'node:vm';
const original = fs.readFileSync('reference/assets/app.js','utf8');
let app = original.replace("function go(name){", "function go(name){window.dispatchEvent(new Event('learning:leaving')); ");
app=app.replace("window.scrollTo(0,0);}\nbackButton", "window.scrollTo(0,0);window.dispatchEvent(new Event('learning:navigate'));}\nbackButton");
app=app.replace("materiIndex===materiPages.length-1){go('home');return}","materiIndex===materiPages.length-1){completeLearning('materi',7,7);go('home');toast('Materi selesai dipelajari!');return}");
app=app.replace("function nextGame(){gameIndex++;gameLocked=false;renderGame();", "function nextGame(){gameIndex++;gameLocked=false;renderGame();if(gameIndex===gameCards.length)completeLearning('game',gameCorrect,gameCards.length);");
app=app.replace("quizDone=true;renderSoal();", "quizDone=true;renderSoal();completeLearning('soal',quizAnswers.filter((v,i)=>v===questions[i].a).length,questions.length,quizAnswers);");
app=app.replace("document.getElementById('checkAnalysis').disabled=true;", "document.getElementById('checkAnalysis').disabled=true;completeLearning('puzzle',n,3);");
// Deliver completion after the original rendering has finished.
app += `\nfunction completeLearning(activity,correct,total,answers){const detail={id:crypto.randomUUID(),activity,correct,total,answers:answers?[...answers]:null};queueMicrotask(()=>window.dispatchEvent(new CustomEvent('learning:complete',{detail})));}\nwindow.resetLearningSession=function(){quizIndex=0;quizAnswers=Array(questions.length).fill(null);quizDone=false;materiIndex=0;gameIndex=0;gameCards=[];gameLocked=false;puzzleIndex=-1;puzzleBag=[];puzzleSolved=false;analysisAnswers=[null,null,null];};\n`;
fs.writeFileSync('public/app.js',app);
// Copy exact APK answer bank into SQL so quiz scores can be calculated in PostgreSQL.
const start=original.indexOf('const questions = [');
const end=original.indexOf('\nquizAnswers =',start);
const bank=vm.runInNewContext(original.slice(start,end)+'; questions');
fs.writeFileSync('supabase/seed.sql',`-- Bank soal dari APK Jelajah Iklan. Jalankan setelah schema.sql.\ninsert into public.quiz_keys (id, answers) values (1, '${JSON.stringify(bank.map(q=>q.a))}'::jsonb)\non conflict (id) do update set answers=excluded.answers;\n`);
