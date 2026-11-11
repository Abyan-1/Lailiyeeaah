# Lailyeeaah 🌸

Web monitoring jualan sewa (langganan) aplikasi: setiap pelanggan tampil dalam satu kartu dengan hitung mundur sisa waktu sewa, dan **notifikasi WhatsApp terkirim otomatis** begitu masa sewa habis — walau web tidak sedang dibuka.

Dibangun sesuai PRD: HTML + Tailwind CSS + Alpine.js (frontend), Vercel Serverless Functions (backend), Supabase (database), Fonnte (WhatsApp), cron-job.org (penjadwal 5 menit).

## Struktur folder

```
lailyeeaah/
├─ index.html          # Halaman Monitoring (kartu + countdown + Done)
├─ riwayat.html        # Halaman Riwayat (tabel, filter bulan, total pendapatan)
├─ login.html          # Login admin
├─ css/style.css       # Hasil build Tailwind (sudah disertakan)
├─ src/input.css       # Sumber Tailwind
├─ js/app.js           # Countdown, form, Done, riwayat, login
├─ api/
│  ├─ rentals.js       # CRUD sewa (GET/POST/PUT/DELETE)
│  ├─ packages.js      # Paket harga untuk dropdown
│  ├─ login.js         # Login/logout admin (cookie sesi)
│  └─ check-expired.js # Cek sewa habis + kirim WA (dipanggil cron)
├─ lib/util.js         # Helper bersama (Supabase, auth, hitung tanggal)
├─ supabase/schema.sql # Skema database + seed paket harga
├─ tailwind.config.js
├─ vercel.json
├─ package.json
└─ .env.example        # Daftar environment variable
```

## Cara deploy (±15 menit)

### 1. Supabase
1. Buat project baru di [supabase.com](https://supabase.com) (paket gratis).
2. Buka **SQL Editor** → jalankan isi `supabase/schema.sql` → tabel `rentals` & `price_packages` terbuat beserta 4 paket harga contoh.
3. Catat dari **Project Settings → API**: `Project URL` dan `service_role` key.

### 2. Fonnte (WhatsApp)
1. Daftar di [fonnte.com](https://fonnte.com), tambahkan device, **scan QR** dengan nomor WA pengirim.
2. Salin **token** dari dashboard.

### 3. Vercel
1. Push folder ini ke repo GitHub.
2. Import repo di [vercel.com](https://vercel.com) (framework: **Other**).
3. Isi Environment Variables (lihat `.env.example`):
   `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `FONNTE_TOKEN`, `ADMIN_WA_NUMBER`, `ADMIN_PASSWORD`, `CRON_SECRET`.
4. Deploy. Web bisa diakses di `https://<nama>.vercel.app`, login memakai `ADMIN_PASSWORD`.

### 4. cron-job.org (penjadwal)
1. Daftar di [cron-job.org](https://cron-job.org) (gratis).
2. Buat job baru:
   - URL: `https://<nama>.vercel.app/api/check-expired?key=<CRON_SECRET>`
   - Jadwal: **setiap 5 menit**.
3. Simpan. (Vercel Cron tidak dipakai karena paket Hobby hanya mengizinkan sekali sehari.)

## Cara kerja notifikasi WA (hanya ke admin)

cron-job.org memanggil `/api/check-expired?key=<CRON_SECRET>` tiap 5 menit. Pesan **hanya dikirim ke `ADMIN_WA_NUMBER`**, dua tahap, masing-masing sekali:

1. **⚠️ SEWA HAMPIR HABIS** — saat sisa waktu ≤ `PERINGATAN_MENIT` (default 10 menit).
2. **📢 SEWA HABIS** — saat waktu sewa sudah lewat.

Kalau Fonnte gagal, sistem mencoba lagi tiap putaran sampai berhasil. Alasan gagalnya tersimpan di kolom `notif_error`, dan kartu diberi tanda **⚠ Notif gagal** setelah 3 kali gagal.

> Tanpa job di cron-job.org, **tidak akan ada notif sama sekali**. Vercel tidak menjalankan pengecekan sendiri.

## Notif tidak masuk? Diagnosa dalam 1 menit

Buka di browser: `https://<domain>.vercel.app/api/test-wa?key=<CRON_SECRET>`

Hasilnya menampilkan 4 langkah, dan langkah yang `ok: false` adalah penyebabnya:

| Langkah | Kalau gagal |
| --- | --- |
| 1_konfigurasi | Env var di Vercel kosong/salah format → isi lalu **Redeploy** |
| 2_database | Kolom belum ada → jalankan `supabase/migrasi-v3.sql` |
| 3_seharusnya_dinotif | Daftar sewa yang mestinya dinotif + alasan gagal terakhir |
| 4_kirim_tes_ke_admin | Jawaban asli Fonnte (device disconnect, token salah, kuota habis, dll.) |

Setelah tes berhasil, cek juga riwayat eksekusi job di cron-job.org: statusnya harus **200**, bukan 401/404/500.

## Upgrade dari versi sebelumnya

1. Jalankan `supabase/migrasi-v3.sql` di SQL Editor Supabase.
2. Pastikan semua env var di `.env.example` sudah ada di Vercel (termasuk `ADMIN_PASSWORD`), lalu push & redeploy.
3. Buka `/api/test-wa?key=...` untuk memastikan semuanya hijau.

## Pengembangan lokal

```bash
npm install
npm run dev          # watch Tailwind → css/style.css
npx vercel dev       # jalankan frontend + /api di localhost (butuh file .env.local)
```

> `css/style.css` hasil build sudah disertakan, dan Vercel juga membangun ulang otomatis lewat `npm run build` saat deploy.

## Mengubah paket harga dropdown

Lewat tabel `price_packages` di dashboard Supabase (tambah/ubah baris, set `aktif = false` untuk menyembunyikan), atau lewat API `POST/PUT/DELETE /api/packages` setelah login.
