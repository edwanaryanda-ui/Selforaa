# Selfora – Tahap 2 (Supabase)

## Struktur folder
```
selfora/
├── index.html        Halaman & markup
├── style.css         Desain
├── script.js         Logika (Supabase Auth, database, notifikasi)
├── materi-data.js    Materi awal (cadangan + bahan impor ke database)
├── config.js         <-- ISI URL & anon key Supabase di sini
├── supabase/schema.sql  Tabel, trigger, hak akses (RLS)
└── README.md
```
Backend = Supabase (Postgres + Auth + Realtime). Tidak perlu server sendiri; hak akses dijaga di database (RLS).

## 1. Buat project Supabase
1. Daftar di https://supabase.com → **New project** (pilih region terdekat, mis. Singapore).
2. Buka **SQL Editor → New query**, buka `supabase/schema.sql`, **ubah kode rahasia konselor** (`GANTI-KODE-RAHASIA-BK`), lalu **Run**.
3. **Authentication → Providers → Email**: aktif. Untuk uji coba, matikan *Confirm email* agar bisa langsung masuk (nyalakan lagi saat resmi dipakai).
4. **Project Settings → API**: salin **Project URL** dan **anon public key** ke `config.js`. Jangan pernah memakai *service_role key* di frontend.

## 2. Jalankan di komputer
Jangan hanya klik dua kali; jalankan server lokal:
- VS Code: instal ekstensi **Live Server** → klik kanan `index.html` → *Open with Live Server*, atau
- Terminal: `python -m http.server 8000` di folder selfora, lalu buka http://localhost:8000

## 3. Akun demo (buat sendiri lewat form Daftar)
- Mahasiswa: pilih *Mahasiswa* → Daftar (mis. `mahasiswa@contoh.id`, sandi min. 6 karakter).
- Konselor: pilih *Konselor / Dosen BK* → Daftar → isi **kode registrasi** dari langkah 1.
- Login konselor pertama kali: klik **Impor 5 materi awal** di dashboard agar materi tersimpan di database.

## 4. Uji alur
1. Mahasiswa daftar & masuk → 2. buka materi, tandai selesai → 3. isi refleksi & jurnal → 4. kirim pesan di *Ruang Umpan Balik* → 5. buka jendela lain (atau perangkat lain), masuk sebagai konselor, lihat pesan (muncul notifikasi) → 6. balas → 7. mahasiswa masuk lagi, buka pesan, baca balasan.

## 5. Hak akses & privasi (di database)
- `profiles.role` hanya dibuat oleh trigger; konselor wajib kode rahasia; klien tidak bisa mengubah peran.
- Jurnal, refleksi, jawaban, dan progres: policy `user_id = auth.uid()` → konselor pun tidak bisa membacanya.
- Pesan: mahasiswa hanya melihat pesannya; konselor melihat pesan Ruang Umpan Balik saja.
- Nama/email pengirim diisi trigger server, tidak bisa dipalsukan. Konselor hanya bisa mengubah kolom `counselor_seen`; mahasiswa hanya `seen` pada balasan.
- Kata sandi di-hash oleh Supabase Auth. Semua teks di-escape di tampilan (anti XSS).

## 6. Unggah ke hosting
Situs ini statis, cukup unggah seluruh folder:
- **Netlify**: app.netlify.com/drop → seret folder `selfora`.
- **Cloudflare Pages / Vercel / GitHub Pages**: hubungkan repositori atau unggah folder, tanpa build command.
Setelah dapat alamat situs, tambahkan di Supabase **Authentication → URL Configuration** (*Site URL*) agar email konfirmasi mengarah ke situs.

## Catatan
Selfora adalah media edukasi dan refleksi diri, bukan pengganti konseling profesional. Untuk pemakaian nyata di kampus, tinjau kebijakan privasi/persetujuan pengguna dan pertimbangkan pengamanan tambahan (mis. batasi pendaftaran konselor oleh admin).
