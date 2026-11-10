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

## Cara kerja notifikasi WA

1. cron-job.org memanggil `/api/check-expired` tiap 5 menit.
2. Endpoint mencari sewa `status = aktif`, `tanggal_berakhir <= sekarang`, `notif_terkirim = false`, `notif_percobaan < 3`.
3. Pesan dikirim via Fonnte ke nomor admin (dan nomor pelanggan jika diisi).
4. Berhasil → `notif_terkirim = true` + waktu kirim disimpan (tidak akan dobel).
   Gagal → `notif_percobaan + 1`, dicoba lagi putaran berikutnya (maks 3×), kartu diberi tanda **⚠ Notif gagal**.

## Uji cepat (kriteria penerimaan)

Tambah sewa tes: durasi **1 hari**, tanggal sewa diundur ke **kemarin** → kartu langsung berstatus HABIS → dalam ≤ 10 menit pesan WA masuk ke nomor admin, tanpa web dibuka.

## Pengembangan lokal

```bash
npm install
npm run dev          # watch Tailwind → css/style.css
npx vercel dev       # jalankan frontend + /api di localhost (butuh file .env.local)
```

> `css/style.css` hasil build sudah disertakan, dan Vercel juga membangun ulang otomatis lewat `npm run build` saat deploy.

## Mengubah paket harga dropdown

Lewat tabel `price_packages` di dashboard Supabase (tambah/ubah baris, set `aktif = false` untuk menyembunyikan), atau lewat API `POST/PUT/DELETE /api/packages` setelah login.
