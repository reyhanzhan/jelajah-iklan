# Jelajah Iklan — website

Website berdasarkan aset dan kode web di `Jelajah-Iklan.apk` yang diberikan pengguna. Tampilan dan ilustrasi bersumber dari APK, dengan 7 halaman materi dan 25 soal pilihan ganda asli. Pilah Iklan menggunakan 20 kartu acak per permainan (10 komersial dan 10 nonkomersial). Menu Game berisi 5 poster susun gambar (3 komersial dan 2 nonkomersial), termasuk poster Roti Ceria yang ditambahkan pada versi web. Tantangan Pintar memiliki dua pilihan: Pilihan Ganda dan Esai; esai ditandai Segera hadir sampai soal disediakan. Penambahan: role admin/guru/murid, kelas, akun buatan pengajar, laporan belajar, serta musik instrumental orisinal dengan hidup/mati dan volume.

## Menjalankan lokal

Gunakan Node.js 24.15+ (atau Node 22.22.2+) agar sesuai dengan dependency pengujian.

```powershell
npm.cmd install
npm.cmd run dev
```

Buka URL lokal yang ditampilkan, biasanya `http://127.0.0.1:5173`. Tanpa konfigurasi Supabase, tombol **Masuk** menyediakan demo tiga role. Mode ini diberi label jelas dan datanya hanya tersimpan di browser. Akun yang dibuat di demo bukan akun login sungguhan. Kata sandi demo tidak disimpan. Untuk mengulang demo dari awal, hapus entri `jelajah-demo-v1` di localStorage browser. Preferensi musik disimpan terpisah.

## Hak akses

| Role | Fitur |
| --- | --- |
| Admin | Membuat kelas, akun guru/murid, mengubah role akun lain, melihat semua kelas dan laporan |
| Guru | Membuat kelas, membuat akun murid di kelas miliknya, melihat laporan murid di kelasnya |
| Murid | Membuka materi/game/puzzle/soal, menyimpan hasil, melihat kelas dan hasil sendiri |

Aktivitas juga dapat dicoba tanpa login; hasil tamu tidak disimpan. Aktivitas yang dicoba admin/guru tidak masuk laporan murid. Akun murid dibuatkan oleh admin/guru sesuai permintaan; tidak ada registrasi publik atau kode gabung kelas. Akun guru dibuat admin. Reset kata sandi yang terlupa ditangani pengelola melalui dashboard Supabase; pengguna yang masih dapat masuk bisa mengganti sandinya di Pengaturan.

## Menyambungkan Supabase

Gunakan proyek Supabase baru/kosong, karena migrasi membuat tabel dan trigger aplikasi.

1. Buat proyek Supabase. Sebelum menjalankan SQL, buka **Authentication → Users → Add user → Create new user** untuk membuat satu akun admin awal. Catat UUID akun itu. Aktifkan konfirmasi email akun awal agar dapat login.
2. Jalankan isi `supabase/schema.sql` lewat SQL Editor, lalu `supabase/seed.sql`. Jangan jalankan ulang schema pada database yang sudah terpasang.
3. Jadikan akun awal sebagai admin melalui SQL berikut; ganti UUID dengan akun yang tepat:

   ```sql
   update public.profiles
   set role = 'admin', full_name = 'Admin Sekolah'
   where id = 'UUID-AKUN-ADMIN-AWAL';
   ```

4. Di pengaturan Authentication, nonaktifkan **Allow new users to sign up**. Trigger database juga menolak pembuatan akun yang tidak memiliki metadata server `provisioned`. Setelah pemasangan, gunakan website untuk membuat akun berikutnya.
5. Pasang Edge Function pembuatan akun. Dari direktori proyek:

   ```powershell
   npx supabase login
   npx supabase link --project-ref ID_PROYEK_SUPABASE
   npx supabase functions deploy create-account
   ```

   Fungsi menggunakan secret server bawaan Supabase (`SUPABASE_SECRET_KEYS.default`, atau legacy `SUPABASE_SERVICE_ROLE_KEY`). Tidak perlu menaruh secret ini di frontend. JWT platform dan `auth.getUser()` memvalidasi sesi, lalu fungsi memeriksa role dan kepemilikan kelas sebelum membuat akun. Pembuatan murid otomatis menambahkan keanggotaan kelas; kegagalan tahap itu membatalkan akun yang baru dibuat.
6. Salin `.env.example` menjadi `.env.local`, isi URL proyek dan **publishable key** dari Supabase Project Settings → API Keys. Legacy anon key juga didukung. **Jangan gunakan service-role/secret key pada variabel `VITE_*`** karena variabel tersebut dikirim ke browser.
7. Jalankan ulang dev server. Masuk menggunakan akun admin awal, buat guru, masuk sebagai guru, buat kelas, lalu buat akun murid. Form pembuatan akun tidak mengirim email; pengajar memberikan email login dan sandi awal kepada pemilik akun.

## Deployment: Vercel + Supabase

Rekomendasi proyek ini adalah **Vercel untuk frontend, Supabase untuk PostgreSQL, Auth, dan Edge Function**. Tidak diperlukan server Node yang selalu berjalan. Railway dapat digunakan bila kemudian ditambahkan backend khusus, worker antrean, atau proses server jangka panjang; kebutuhan saat ini sudah ditangani Supabase.

1. Simpan proyek di repository Git. `.env.local` dan `node_modules` sudah diabaikan.
2. Import repository ke Vercel. Pilih preset **Vite**, build command `npm run build`, output `dist` (juga tersedia di `vercel.json`).
3. Tambahkan `VITE_SUPABASE_URL` dan `VITE_SUPABASE_PUBLISHABLE_KEY` di environment Vercel untuk Production dan Preview yang digunakan.
4. Deploy. Set **Site URL** Supabase Auth ke domain produksi tersebut. Tambahkan URL pengalihan hanya jika nanti mengaktifkan flow email/password recovery.
5. Uji tiga akun sungguhan setelah deploy: guru A tidak boleh melihat murid guru B; murid hanya boleh melihat hasil sendiri; akun admin dapat membuat guru. Uji pembuatan akun melalui Edge Function dan penyimpanan nilai soal.

Environment Vite dibaca saat build; setelah perubahan variabel lakukan redeploy. Tanpa kedua variabel, deployment menampilkan mode demo. Website belum dipublikasikan oleh pekerjaan ini.

## Musik

Musik instrumental dibuat dengan Web Audio, tanpa file audio atau layanan eksternal. Pengaturan memiliki tombol hidup/mati dan volume; default mati. Browser memerlukan interaksi pengguna sebelum audio dapat berjalan. Musik dijeda saat tab tidak terlihat. Preferensi disimpan per perangkat. Perangkat mute atau pembatasan browser tetap dapat menonaktifkan suara.

## Struktur

- `reference/assets/`: salinan acuan APK yang tidak diubah.
- `public/`: aset asli dan `app.js` dengan hook penyimpanan hasil.
- `src/portal.js`: login, ruang admin/guru/murid, laporan, pengaturan.
- `src/data.js`: Supabase dan penyimpanan demo.
- `src/music.js`: musik Web Audio.
- `supabase/schema.sql`: tabel, RLS, trigger pembuatan profil, RPC role/nilai.
- `supabase/seed.sql`: kunci 25 soal untuk perhitungan nilai server.
- `supabase/functions/create-account/index.ts`: pembuatan akun oleh admin/guru.
- `scripts/integrate.mjs`: menyelaraskan kunci pilihan ganda dari `public/app.js` ke `supabase/seed.sql`; tidak menimpa kode aplikasi dengan referensi APK.

## Pengujian dan batas verifikasi

```powershell
npm.cmd test
npm.cmd run build
```

Pengujian mencakup SQL/RLS di PostgreSQL lokal melalui PGlite, perhitungan nilai server, larangan eskalasi role, isolasi kelas, penolakan signup publik, serta interaksi DOM demo dan pengaturan audio. DOM test bukan pengujian visual browser. Audio test memverifikasi hidup/mati dan preferensi dengan AudioContext tiruan; belum memverifikasi suara secara auditori.

Nilai soal dihitung oleh server dari jawaban yang dikirim. Kunci jawaban juga tetap ada dalam aplikasi untuk pembahasan sesuai APK; aplikasi ini ditujukan untuk latihan, bukan ujian tertutup. Skor game/puzzle serta penyelesaian materi dilaporkan client dan ditandai sebagai latihan. Laporan memuat maksimal 500 aktivitas terakhir yang dapat diakses akun. Perubahan role murid menjadi pengajar menghapus keanggotaannya sebagai murid; hasil historis tetap ada. Guru yang masih mempunyai kelas tidak dapat diturunkan menjadi murid.

Browser visual tidak tersedia pada sesi pembuatan. Belum tersambung ke proyek Supabase milik pengguna; login nyata, Edge Function di cloud, dan deployment perlu diverifikasi setelah konfigurasi di atas.

Referensi resmi: [Vite di Vercel](https://vercel.com/docs/frameworks/frontend/vite), [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security), [Supabase Auth configuration](https://supabase.com/docs/guides/auth/general-configuration), [Edge Function authorization](https://supabase.com/docs/guides/functions/auth-headers), [Railway](https://docs.railway.com/quick-start).

## Pembaruan kegiatan belajar

Nama menu dan laporan disesuaikan menjadi Materi, Pilah Iklan, Game, dan Tantangan Pintar. Identitas kegiatan dalam database tetap sama sehingga hasil lama tetap terbaca. Pembaruan ini tidak memerlukan migrasi database: nilai Pilah Iklan memakai total 20, sedangkan analisis setiap poster tetap 3 pertanyaan. Kelima poster muncul dalam urutan acak tanpa pengulangan sampai satu putaran selesai.
