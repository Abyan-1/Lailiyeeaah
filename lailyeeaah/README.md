# Lailyeeaah 🌸

Web monitoring sewa (langganan) aplikasi: setiap pelanggan tampil dalam satu kartu dengan hitung mundur sisa waktu sewa, **ruang chat internal "Bot Lailyeeaah"**, dan **Web Push Notification otomatis** langsung ke browser/HP admin begitu masa sewa hampir habis atau sudah habis — walau web sedang ditutup.

Dibangun dengan stack: HTML + Tailwind CSS + Alpine.js (frontend), Vercel Serverless Functions (backend CommonJS), Supabase (database via `service_role` key dengan RLS aktif), Web Push (VAPID), dan cron-job.org (penjadwal rutin 5 menit).

---

## Struktur Folder

```
lailyeeaah/
├─ index.html               # Halaman Monitoring (kartu sewa + countdown + banner push notif)
├─ riwayat.html             # Halaman Riwayat sewa selesai (filter bulan & total omzet)
├─ paket.html               # Halaman Kelola Paket Harga
├─ chat.html                # Ruang Chat "Bot Lailyeeaah" (pesan bot + tombol aksi cepat)
├─ login.html               # Halaman login admin
├─ sw.js                    # Service Worker (event push & notificationclick)
├─ manifest.webmanifest     # Manifest PWA (Add to Home Screen untuk iOS / Android)
├─ icons/                   # Ikon aplikasi 192px & 512px
├─ css/style.css            # Hasil kompilasi Tailwind CSS
├─ src/input.css            # Sumber stylesheet Tailwind
├─ js/app.js                # Frontend logic (Alpine.js, Web Push, Chat, Rentals)
├─ api/
│  ├─ rentals.js            # CRUD sewa (GET/POST/PUT/DELETE)
│  ├─ packages.js           # Kelola paket harga
│  ├─ login.js              # Sesi login admin (cookie httpOnly)
│  ├─ chat.js               # API ruang chat bot (GET/POST/PUT mark read)
│  ├─ push-subscribe.js     # API pendaftaran push subscription admin
│  ├─ test-push.js          # Diagnosa koneksi database & pengujian push
│  └─ check-expired.js      # Pemeriksaan sewa habis (dipanggil cron-job.org)
├─ lib/
│  ├─ util.js               # Helper umum (Supabase, autentikasi sesi, format)
│  ├─ push.js               # Web Push sender (VAPID & auto-cleanup expired subs)
│  ├─ chat.js               # Pengirim pesan bot (DB first -> Push notification)
│  └─ notif.js              # Pembuat pesan bot & validasi konfigurasi
├─ supabase/
│  ├─ schema.sql            # Skema lengkap database
│  ├─ migrasi-v3.sql        # Migrasi v3
│  └─ migrasi-v4-push-chat.sql # Migrasi v4 (tabel push_subscriptions & chat_messages)
├─ vercel.json              # Konfigurasi deployment Vercel & no-cache sw.js
├─ package.json
└─ .env.example             # Contoh environment variables
```

---

## Alur Notifikasi Bot & Web Push

cron-job.org memanggil `/api/check-expired?key=<CRON_SECRET>` setiap 5 menit:

1. **⚠️ SEWA HAMPIR HABIS**: Saat sisa waktu sewa ≤ `PERINGATAN_MENIT` (default 10 menit).
2. **📢 SEWA HABIS**: Saat masa sewa sudah melewati `tanggal_berakhir`.

### Mekanisme Pengiriman:
- **Database adalah Sumber Kebenaran**: Setiap pesan bot wajib tersimpan terlebih dahulu ke tabel `chat_messages`. Sewa dianggap sudah dinotif segera setelah pesan chat tersimpan.
- **Web Push sebagai Pemberitahu**: Setelah pesan tersimpan di chat, server mengirimkan Web Push Notification ke seluruh browser/HP admin yang terdaftar di `push_subscriptions`.
- Jika push gagal atau belum ada browser yang aktif, pesan tetap tersimpan aman di ruang chat web admin.
- Saat notifikasi push diklik di browser/HP, halaman `/chat.html` akan terbuka/fokus dan otomatis menggulir (*scroll*) ke pesan terkait.

---

## Langkah Deploy & Setup (±10 menit)

### 1. Jalankan Migrasi di Supabase
1. Buka dashboard project di [supabase.com](https://supabase.com).
2. Buka **SQL Editor** &gt; **New Query**.
3. Jika baru pertama kali setup, jalankan `supabase/schema.sql`.
4. Jika database sudah ada dari versi sebelumnya, jalankan file migrasi:
   `supabase/migrasi-v4-push-chat.sql`
   *(Migrasi ini membuat tabel `push_subscriptions` dan `chat_messages` tanpa menghapus data sewa yang sudah ada).*
5. Salin dari menu **Project Settings → API**:
   - `Project URL`
   - `service_role` key (secret key untuk backend).

### 2. Generate Pasangan Kunci VAPID
Buka terminal dan jalankan:
```bash
npx web-push generate-vapid-keys
```
Perintah ini akan menghasilkan:
- `Public Key` (masukkan ke `VAPID_PUBLIC_KEY`)
- `Private Key` (masukkan ke `VAPID_PRIVATE_KEY`)

### 3. Konfigurasi Environment Variables di Vercel
Buka dashboard project di [vercel.com](https://vercel.com) &gt; **Settings** &gt; **Environment Variables**, isi:

| Variable | Keterangan |
| --- | --- |
| `SUPABASE_URL` | URL project Supabase |
| `SUPABASE_SERVICE_KEY` | `service_role` secret key Supabase |
| `VAPID_PUBLIC_KEY` | Public key dari generator VAPID |
| `VAPID_PRIVATE_KEY` | Private key dari generator VAPID |
| `VAPID_SUBJECT` | Email admin, diawali `mailto:` (mis. `mailto:admin@domain.com`) |
| `ADMIN_PASSWORD` | Password login web admin |
| `CRON_SECRET` | String rahasia bebas untuk cron & diagnosa |
| `PERINGATAN_MENIT` | Opsional: menit sebelum habis untuk peringatan (default: `10`) |

Setelah disimpan, lakukan **Redeploy** di Vercel.

### 4. Setup cron-job.org (Penjadwal Rutin)
1. Buka [cron-job.org](https://cron-job.org) (gratis).
2. Buat job baru:
   - **URL**: `https://<domain-kamu>.vercel.app/api/check-expired?key=<CRON_SECRET>`
   - **Jadwal**: Setiap 5 menit.
3. Simpan job.

### 5. Aktifkan Notifikasi di HP / Browser Admin
1. Buka web di browser atau HP admin: `https://<domain-kamu>.vercel.app`
2. Login menggunakan `ADMIN_PASSWORD`.
3. Klik tombol **"🔔 Aktifkan Notifikasi"** pada banner yang muncul di atas halaman Monitoring atau Ruang Chat.
4. Izinkan notifikasi pada dialog pop-up browser. Status akan berubah menjadi **"Notifikasi Aktif ✓"**.
5. *Khusus iPhone / iPad (iOS 16.4+)*: Tekan tombol **Share** di Safari &gt; pilih **"Add to Home Screen"** (Tambahkan ke Layar Utama), buka web dari ikon di Layar Utama, lalu klik tombol **"🔔 Aktifkan Notifikasi"**.

### 6. Uji Notifikasi (Diagnosa)
Buka di browser atau panggil URL:
`https://<domain-kamu>.vercel.app/api/test-push?key=<CRON_SECRET>`

Endpoint ini akan:
1. Memverifikasi seluruh konfigurasi environment variable.
2. Memeriksa koneksi database & jumlah subscriber push aktif.
3. Mengirimkan 1 pesan tes langsung ke ruang chat bot dan push notification ke browser/HP admin.

---

## Pengembangan Lokal

```bash
npm install
npm run dev          # Watch & kompilasi Tailwind CSS
npx vercel dev       # Jalankan serverless function & web lokal (menggunakan .env.local)
```
