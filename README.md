# Jelajah Iklan — website

Website berdasarkan aset dan kode web di `Jelajah-Iklan.apk` yang diberikan pengguna. Tampilan dan ilustrasi bersumber dari APK, dengan 7 halaman materi dan 25 soal pilihan ganda asli. Pilah Iklan menggunakan jumlah kartu yang diatur pengajar (default 20), dipilih acak dengan komposisi jenis iklan bebas. Menu Game berisi 5 poster susun gambar (3 komersial dan 2 nonkomersial), termasuk poster Roti Ceria yang ditambahkan pada versi web. Tantangan Pintar memiliki dua pilihan: Pilihan Ganda dan Esai; esai ditandai Segera hadir sampai soal disediakan. Penambahan: role admin/guru/murid, kelas, akun buatan pengajar, laporan belajar, serta musik instrumental orisinal dengan hidup/mati dan volume.

## Menjalankan lokal

Gunakan Node.js 24.15+ (atau Node 22.22.2+) agar sesuai dengan dependency pengujian.

```powershell
npm.cmd install
npm.cmd run dev
```

Buka URL lokal yang ditampilkan, biasanya `http://127.0.0.1:5173`. Isi `.env.local` dengan URL dan publishable key Supabase sebelum menjalankan aplikasi. Tanpa konfigurasi tersebut, halaman menampilkan pemberitahuan layanan akun belum terhubung dan akses belajar tetap tertutup. Preferensi musik tetap disimpan per perangkat.

## Hak akses

| Role | Fitur |
| --- | --- |
| Admin | Membuat kelas, akun guru/murid, mengubah role akun lain, melihat semua kelas dan laporan |
| Guru | Membuat kelas, membuat akun murid di kelas miliknya, melihat laporan murid di kelasnya |
| Murid | Membuka materi/game/puzzle/soal, menyimpan hasil, melihat kelas dan hasil sendiri |

Pengunjung pertama kali melihat cover dan form login. Menu belajar muncul setelah login dan profil akun berhasil dimuat; sesi yang masih aktif langsung membuka menu. Keluar akun mengembalikan pengguna ke cover. Seluruh akses menggunakan akun Supabase; tidak ada pemilihan role atau akun lokal untuk melewati login. Aktivitas yang dicoba admin/guru tidak masuk laporan murid. Akun murid dibuatkan oleh admin/guru sesuai permintaan; tidak ada registrasi publik atau kode gabung kelas. Akun guru dibuat admin. Reset kata sandi yang terlupa ditangani pengelola melalui dashboard Supabase; pengguna yang masih dapat masuk bisa mengganti sandinya di Pengaturan.

## Menyambungkan Supabase

### Upgrade: kelola konten oleh admin dan guru

Untuk database yang sudah berjalan, buka `supabase/content-management.sql`, salin seluruh isinya ke Supabase SQL Editor, lalu Run. File ini menambahkan bank konten, versi soal, penyimpanan jawaban esai, dan bucket gambar `learning-images`. Akun, kelas, dan hasil lama tetap tersedia. Query boleh dijalankan ulang; konten yang diedit pengajar tidak ditimpa. Untuk instalasi baru, jalankan `schema.sql` dan `seed.sql` lebih dahulu, lalu upgrade ini.

Masuk sebagai admin/guru → **Ruang belajar → Kelola konten**. Pilih Pilihan Ganda, Esai, Pilah Iklan, Materi, atau Game Puzzle. Tombol **Tambah** membuat konten baru; **Edit** memperbarui konten yang sudah ada; **Hapus** meminta konfirmasi sebelum menghapus konten dari bank aktif. Versi lama dan hasil belajar tetap disimpan. Pilihan ganda, materi, puzzle, dan bank iklan harus menyisakan minimal satu konten agar kegiatan tetap dapat dimainkan. Tidak ada batas minimal per jenis iklan. Esai boleh dikosongkan. Untuk mengaktifkan tombol Hapus pada instalasi sebelumnya, jalankan ulang file SQL upgrade versi terbaru. Materi menggunakan teks biasa dan gambar opsional. Poster puzzle dapat diunggah dalam format JPG/PNG/WebP maksimal 5 MB, atau diisi URL HTTPS. Jumlah kartu Pilah Iklan diatur lewat kategori Pilah Iklan ? Atur permainan. Kartu dipilih acak tanpa kuota komersial/nonkomersial, maksimal sesuai jumlah bank yang tersedia. Nilai benar semua tetap 100. Tambahan poster dan pilihan ganda mengikuti jumlah bank terbaru.

Bank ini digunakan bersama oleh semua kelas. Perubahan dimuat saat login; pengajar dapat memakai **Muat ulang** sebelum mengedit. Versi sebelumnya disimpan agar nilai murid yang sedang mengerjakan tetap dihitung memakai soal yang diterimanya. Dua editor bersamaan akan mendapat pesan konflik, bukan saling menimpa perubahan. Jawaban esai disimpan terpisah tanpa nilai otomatis dan bisa dibaca di **Jawaban esai**; guru hanya melihat murid yang diajarnya, admin melihat semua.

Jika upgrade belum dijalankan, kegiatan lama masih dapat dipakai dan menu Kelola konten memberi petunjuk aktivasi. File `content-management-base.sql` adalah sumber migrasi; sesudah mengubah sumber atau konten bawaan, jalankan `node scripts/build-content-migration.mjs` untuk membentuk ulang file SQL lengkap.

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

   Alternatif tanpa terminal: **Supabase → Edge Functions → Deploy a new function → Via Editor**. Beri nama tepat `create-account`, ganti seluruh isi `index.ts` dengan `supabase/functions/create-account/index.ts` dari repo ini, lalu **Deploy function**. Ini dipasang di Supabase, terpisah dari deployment frontend Vercel. Jika belum dipasang, endpoint merespons 404 dan menu Buat akun tidak dapat bekerja.

   ```powershell
   npx supabase login
   npx supabase link --project-ref ID_PROYEK_SUPABASE
   npx supabase functions deploy create-account
   ```

   Fungsi menggunakan secret server bawaan Supabase (`SUPABASE_SECRET_KEYS.default`, atau legacy `SUPABASE_SERVICE_ROLE_KEY`). Tidak perlu menaruh secret ini di frontend. JWT platform dan `auth.getUser()` memvalidasi sesi, lalu fungsi memeriksa role dan kepemilikan kelas sebelum membuat akun. Pembuatan murid otomatis menambahkan keanggotaan kelas; kegagalan tahap itu membatalkan akun yang baru dibuat.
6. Salin `.env.example` menjadi `.env.local`, isi URL proyek dan **publishable key** dari Supabase Project Settings → API Keys. Legacy anon key juga didukung. **Jangan gunakan service-role/secret key pada variabel `VITE_*`** karena variabel tersebut dikirim ke browser.
7. Jalankan ulang dev server. Masuk menggunakan akun admin awal, buat guru, masuk sebagai guru, buat kelas, lalu buat akun murid. Form pembuatan akun tidak mengirim email; pengajar memberikan email login dan sandi awal kepada pemilik akun.

Tidak ada lagi batas minimal 10 karakter di aplikasi; form dan Edge Function menerima sandi yang tidak kosong (maksimal 128 karakter). Supabase Auth tetap menerapkan aturan sandi proyek, dan penolakan ditampilkan pada form. Email akun baru harus belum digunakan. Jika mengubah kode fungsi pembuatan akun, deploy ulang fungsi `create-account` juga, bukan hanya push frontend ke Vercel.

## Deployment: Vercel + Supabase

### Tiga akun awal

Template `supabase/create-initial-accounts.sql` membuat akun login `admin`, `guru`, dan `siswa`, beserta satu kelas guru dan keanggotaan siswa. Ganti tiga placeholder sandi sebelum menjalankannya melalui SQL Editor setelah schema aplikasi terpasang. Query ini tidak mereset sandi ketika dijalankan ulang. Akun awal memakai email internal `admin@jelajah-iklan.test`, `guru@jelajah-iklan.test`, dan `siswa@jelajah-iklan.test`; alamat tersebut tidak menerima email. Halaman login menerima nama pendek tersebut atau email lengkap. Akun lain tetap masuk menggunakan email yang didaftarkan. Role siswa dalam database bernama `murid`.

Query berisi sandi nyata yang disiapkan khusus untuk pemilik disimpan lokal di `test-results/BUAT-3-AKUN.sql`, yang diabaikan Git. Jangan menyalinnya ke `public/` atau repository. Untuk pembuatan akun berikutnya, gunakan menu Kelola akun yang memanggil Supabase Auth Admin API melalui Edge Function. Pengujian SQL lokal memakai replika struktur Auth; login sungguhan tetap perlu dicoba setelah query dijalankan pada proyek Supabase.

Rekomendasi proyek ini adalah **Vercel untuk frontend, Supabase untuk PostgreSQL, Auth, dan Edge Function**. Tidak diperlukan server Node yang selalu berjalan. Railway dapat digunakan bila kemudian ditambahkan backend khusus, worker antrean, atau proses server jangka panjang; kebutuhan saat ini sudah ditangani Supabase.

1. Simpan proyek di repository Git. `.env.local` dan `node_modules` sudah diabaikan.
2. Import repository ke Vercel. Pilih preset **Vite**, build command `npm run build`, output `dist` (juga tersedia di `vercel.json`).
3. Tambahkan `VITE_SUPABASE_URL` dan `VITE_SUPABASE_PUBLISHABLE_KEY` di environment Vercel untuk Production dan Preview yang digunakan. Nama `NEXT_PUBLIC_SUPABASE_URL` dan `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` juga didukung; jika keduanya tersedia, nilai `VITE_` diutamakan. Setelah mengubah env, lakukan deployment baru agar nilainya masuk ke hasil build. Form tetap terlihat ketika env belum diisi, tetapi tombol masuk belum aktif.
4. Deploy. Set **Site URL** Supabase Auth ke domain produksi tersebut. Tambahkan URL pengalihan hanya jika nanti mengaktifkan flow email/password recovery.
5. Uji tiga akun sungguhan setelah deploy: guru A tidak boleh melihat murid guru B; murid hanya boleh melihat hasil sendiri; akun admin dapat membuat guru. Uji pembuatan akun melalui Edge Function dan penyimpanan nilai soal.

Environment Vite dibaca saat build; setelah perubahan variabel lakukan redeploy. Tanpa kedua variabel, login tidak aktif dan akses belajar tetap tertutup.

## Musik

Musik instrumental dibuat dengan Web Audio, tanpa file audio atau layanan eksternal. Pengaturan memiliki tombol hidup/mati dan volume; default mati. Browser memerlukan interaksi pengguna sebelum audio dapat berjalan. Musik dijeda saat tab tidak terlihat. Preferensi disimpan per perangkat. Perangkat mute atau pembatasan browser tetap dapat menonaktifkan suara.

## Struktur

- `reference/assets/`: salinan acuan APK yang tidak diubah.
- `public/`: aset asli dan `app.js` dengan hook penyimpanan hasil.
- `src/portal.js`: login, ruang admin/guru/murid, laporan, pengaturan.
- `src/data.js`: akses Supabase dan pemetaan nama login akun awal.
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

Pengujian mencakup SQL/RLS di PostgreSQL lokal melalui PGlite, perhitungan nilai server, larangan eskalasi role, isolasi kelas, penolakan signup publik, serta interaksi DOM dengan layanan akun tiruan khusus pengujian dan pengaturan audio. DOM test bukan pengujian visual browser. Audio test memverifikasi hidup/mati dan preferensi dengan AudioContext tiruan; belum memverifikasi suara secara auditori.

Nilai soal dihitung oleh server dari jawaban yang dikirim. Kunci jawaban juga tetap ada dalam aplikasi untuk pembahasan sesuai APK; aplikasi ini ditujukan untuk latihan, bukan ujian tertutup. Skor game/puzzle serta penyelesaian materi dilaporkan client dan ditandai sebagai latihan. Laporan memuat maksimal 500 aktivitas terakhir yang dapat diakses akun. Perubahan role murid menjadi pengajar menghapus keanggotaannya sebagai murid; hasil historis tetap ada. Guru yang masih mempunyai kelas tidak dapat diturunkan menjadi murid.

Browser visual tidak tersedia pada sesi pembuatan. Belum tersambung ke proyek Supabase milik pengguna; login nyata, Edge Function di cloud, dan deployment perlu diverifikasi setelah konfigurasi di atas.

Referensi resmi: [Vite di Vercel](https://vercel.com/docs/frameworks/frontend/vite), [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security), [Supabase Auth configuration](https://supabase.com/docs/guides/auth/general-configuration), [Edge Function authorization](https://supabase.com/docs/guides/functions/auth-headers), [Railway](https://docs.railway.com/quick-start).

## Pembaruan kegiatan belajar

Nama menu dan laporan disesuaikan menjadi Materi, Pilah Iklan, Game, dan Tantangan Pintar. Identitas kegiatan dalam database tetap sama sehingga hasil lama tetap terbaca. Pembaruan ini tidak memerlukan migrasi database: nilai Pilah Iklan memakai total 20, sedangkan analisis setiap poster tetap 3 pertanyaan. Kelima poster muncul dalam urutan acak tanpa pengulangan sampai satu putaran selesai.

Pilah Iklan menjelaskan jawaban benar/salah dengan jenis iklan, alasan, dan kutipan pesan iklannya. Nilai akhir memakai skala 0–100: jumlah benar dibagi 20 dikali 100 (5 poin per jawaban benar). Ringkasan menampilkan nilai, jumlah benar/salah, dan perhitungannya. Database tetap menyimpan jumlah benar dan total seperti sebelumnya, tanpa perubahan schema.

## Edit/hapus akun dan kelas, serta email murid

Untuk memperbarui instalasi yang sudah berjalan:

1. Jalankan seluruh `supabase/account-management.sql` di Supabase SQL Editor. Aman dijalankan ulang. Skrip ini menambahkan email profil, sinkronisasi email/nama dari Auth, dan fungsi edit/hapus kelas.
2. Buka Edge Functions → `create-account` → Code. Ganti dengan seluruh isi terbaru `supabase/functions/create-account/index.ts`, lalu deploy kembali dengan nama **create-account**. Fungsi yang sama kini melayani tambah, edit, dan hapus akun.
3. Setelah deployment Vercel selesai, muat ulang website. Tombol edit/hapus tersedia pada Kelas dan Kelola akun. Ikon mata tersedia di login, tambah/edit akun, dan ganti sandi.

Admin dapat mengedit nama/email, mereset sandi, dan menghapus akun guru/murid. Guru hanya dapat mengelola murid yang seluruh kelasnya diampu guru tersebut; murid lintas pengajar dikelola admin. Email tampil pada daftar murid, Kelola akun, ruang murid, dan Pengaturan. Sandi lama tidak ditampilkan; kolom sandi kosong saat edit berarti sandi tidak berubah.

Hapus kelas hanya menghapus kelas dan keanggotaannya; akun dan nilai tetap tersimpan. Hapus akun menghapus akun, keanggotaan, nilai, dan jawaban esainya secara permanen setelah konfirmasi. Akun sendiri/admin dilindungi dari penghapusan. Sebelum menghapus guru yang masih mengajar, admin mengganti pengajar melalui Edit kelas. Akun pemilik berkas Storage mungkin perlu dibereskan kepemilikan berkasnya di Supabase terlebih dahulu.

Push ke GitHub/Vercel **tidak** menjalankan SQL atau men-deploy Edge Function Supabase secara otomatis.
