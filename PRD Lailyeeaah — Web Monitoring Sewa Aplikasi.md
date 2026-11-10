# PRD Lailyeeaah — Web Monitoring Sewa Aplikasi

Nov 11, 2026 · @mula

## Ringkasan & tujuan

Lailyeeaah adalah web monitoring jualan sewa (langganan) aplikasi yang menampilkan setiap pelanggan dalam satu kartu dengan hitung mundur sisa waktu sewa, dan otomatis mengirim pengumuman ke WhatsApp begitu masa sewa habis.

Masalah yang diselesaikan: pencatatan sewa manual membuat penjual lupa kapan sewa pelanggan berakhir, sehingga terlambat menagih perpanjangan atau mencabut akses.

Tujuan:

- Semua sewa aktif terlihat dalam satu halaman, lengkap dengan sisa waktunya.
- Tidak ada sewa habis yang terlewat: notifikasi WhatsApp terkirim otomatis paling lambat 15 menit setelah waktu habis, tanpa web harus dibuka.
- Sewa yang selesai tersimpan rapi di halaman Riwayat.
- Web gratis/murah dijalankan dan di-deploy di Vercel.

## Pengguna & ruang lingkup

Pengguna utama hanya satu: pemilik/admin jualan sewa aplikasi. Pelanggan tidak membuka web ini; mereka hanya menerima informasi lewat WhatsApp jika diperlukan.

| Termasuk (versi 1) | Tidak termasuk (versi 1) |
| --- | --- |
| Form tambah sewa: nama, device, tanggal sewa, durasi, harga (dropdown) | Pembayaran online / payment gateway |
| Kartu pelanggan dengan countdown sisa waktu | Akun & login untuk pelanggan |
| Tombol Done di tiap kartu | Laporan keuangan / grafik omzet |
| Halaman Monitoring dan Riwayat | Multi-admin / multi-toko |
| Notifikasi WhatsApp otomatis saat sewa habis | Aplikasi mobile native |
| Login sederhana untuk admin (PIN/password) |  |

## Kebutuhan fungsional

Web punya dua halaman, Monitoring dan Riwayat, dengan navigasi tab di bawah heading "Lailyeeaah".

### F1. Form tambah sewa (di halaman Monitoring)

| Field | Tipe input | Aturan |
| --- | --- | --- |
| Nama pelanggan | Teks | Wajib, maks. 50 karakter |
| Nomor WhatsApp pelanggan | Teks (angka) | Opsional; dipakai jika notif juga dikirim ke pelanggan |
| Device | Teks atau dropdown (mis. iPhone, Android, Laptop) | Wajib |
| Tanggal sewa | Date-time picker | Wajib, default = sekarang |
| Durasi sewa | Angka + satuan (hari / minggu / bulan) | Wajib, minimal 1 |
| Harga sewa | Dropdown paket harga | Wajib; daftar paket bisa diubah admin |

Saat disimpan, sistem menghitung tanggal berakhir = tanggal sewa + durasi, lalu kartu baru muncul di Monitoring tanpa reload.

### F2. Kartu (box) per pelanggan

- Satu pelanggan = satu kartu/container, tersusun dalam grid (1 kolom di HP, 2–3 kolom di laptop).
- Isi kartu: nama, device, tanggal sewa, tanggal berakhir, harga, dan **sisa durasi** dalam format hitung mundur (mis. "2 hari 04 jam 12 menit").
- Sisa durasi berkurang otomatis setiap detik/menit sesuai waktu nyata, dihitung dari tanggal berakhir (bukan disimpan sebagai angka yang dikurangi), sehingga tetap akurat walau web ditutup.
- Progress bar menunjukkan persentase waktu yang sudah terpakai.
- Status warna kartu: Aktif (hijau soft), Hampir habis < 24 jam (kuning/peach), Habis (pink tua + label "HABIS").
- Kartu diurutkan dari yang paling cepat habis.

### F3. Tombol Done

- Setiap kartu punya tombol **Done**.
- Klik Done → muncul konfirmasi → status sewa menjadi Selesai, kartu hilang dari Monitoring dan pindah ke Riwayat.
- Done bisa ditekan sebelum atau sesudah sewa habis (mis. pelanggan berhenti lebih awal, atau akses sudah dicabut).
- Kartu yang sudah habis tetap tampil di Monitoring sampai Done ditekan, supaya admin tidak lupa menindaklanjuti.

### F4. Halaman Monitoring

- Ringkasan di atas: jumlah sewa aktif, hampir habis, dan sudah habis.
- Kolom pencarian nama dan filter status.
- Tombol "+ Tambah Sewa" membuka form F1 (modal).
- Edit dan hapus kartu (untuk salah input).

### F5. Halaman Riwayat

- Tabel/daftar semua sewa berstatus Selesai: nama, device, tanggal sewa, tanggal berakhir, durasi, harga, tanggal Done, status notif WA (terkirim/gagal).
- Pencarian, filter per bulan, dan total pendapatan sesuai filter.
- Tombol "Sewa lagi" untuk membuat sewa baru dengan data pelanggan yang sama.

## Notifikasi WhatsApp otomatis (prioritas utama)

Begitu sisa durasi sebuah sewa mencapai 0, sistem langsung mengirim pengumuman ke WhatsApp, walaupun tidak ada yang sedang membuka web. Karena itu pengecekan harus berjalan di server, bukan di browser.

### Cara kerja

1. Penjadwal eksternal (cron-job.org, gratis) memanggil endpoint `/api/check-expired` setiap 5 menit.
2. Endpoint mencari sewa berstatus Aktif yang `tanggal_berakhir <= sekarang` dan `notif_terkirim = false`.
3. Untuk setiap sewa itu, server mengirim pesan lewat API gateway WhatsApp (rekomendasi: Fonnte).
4. Jika berhasil, `notif_terkirim = true` dan waktu kirim disimpan, sehingga pesan tidak terkirim dua kali. Jika gagal, dicoba lagi di putaran berikutnya (maks. 3 kali) dan kartu diberi tanda "Notif gagal".
5. Opsional: pengingat H-1 (24 jam sebelum habis) dengan alur yang sama.

Kenapa tidak memakai Vercel Cron saja: di paket gratis (Hobby) Vercel, cron hanya boleh berjalan sekali sehari, dan jadwal yang lebih sering akan gagal saat deploy ([dokumentasi Vercel](https://vercel.com/docs/cron-jobs/usage-and-pricing)). Penjadwal eksternal membuat notif tetap tepat waktu tanpa biaya Vercel Pro.

### Isi pesan (template, bisa diubah)

```
📢 SEWA HABIS — Lailyeeaah
Nama   : {nama}
Device : {device}
Mulai  : {tanggal_sewa}
Durasi : {durasi}
Harga  : Rp{harga}
Habis  : {tanggal_berakhir}
Segera konfirmasi perpanjangan atau cabut akses ya.
```

### Penerima

- Default: nomor WhatsApp admin (diatur di halaman Pengaturan / environment variable).
- Opsional: dikirim juga ke nomor pelanggan atau ke grup WhatsApp.

### Pilihan gateway WhatsApp

| Opsi | Kelebihan | Kekurangan |
| --- | --- | --- |
| Fonnte (rekomendasi v1) | Setup cepat: scan QR pakai nomor sendiri, dapat token, kirim lewat satu HTTP request; bisa kirim ke grup | Tidak resmi dari Meta, nomor berisiko diblokir bila kirim massal |
| WhatsApp Cloud API (resmi Meta) | Resmi dan stabil | Perlu verifikasi bisnis, template pesan harus disetujui, biaya per pesan |

Token gateway disimpan di environment variable Vercel, tidak pernah ditaruh di kode frontend.

## Desain UI

Tampilan lembut dan manis: latar krem-pink pucat, kartu putih membulat, aksen pink dan hijau soft, dengan heading besar "Lailyeeaah" di bagian atas setiap halaman.

### Palet warna

| Peran | Warna | Hex | Kelas Tailwind (custom) |
| --- | --- | --- | --- |
| Latar halaman | Pink sangat pucat | #FFF5F8 | `bg-blush-50` |
| Aksen utama (heading, tombol utama) | Pink soft | #F9A8C9 | `bg-blush-300` |
| Aksen gelap (teks heading, hover) | Pink tua | #DB5C8E | `text-blush-600` |
| Status Aktif, tombol Done | Hijau soft (sage/mint) | #A8D5BA | `bg-sage-300` |
| Teks di atas hijau | Hijau tua | #3F7D5A | `text-sage-700` |
| Status Hampir habis | Peach | #FFD6A5 | `bg-peach-200` |
| Teks utama | Abu gelap | #4A4453 | `text-ink` |

Warna didaftarkan di `tailwind.config` agar konsisten di semua komponen.

### Tipografi & elemen

- Heading "Lailyeeaah": font script/rounded (mis. Pacifico atau Poppins Bold dari Google Fonts), warna pink tua, ukuran 40–48 px, rata tengah.
- Teks isi: Poppins atau Nunito, 14–16 px.
- Kartu: `rounded-2xl`, bayangan halus, garis tepi kiri berwarna sesuai status.
- Sisa durasi ditampilkan paling besar di kartu (angka tebal), lalu progress bar tipis.
- Tombol Done: hijau soft, ikon centang, lebar penuh di bagian bawah kartu.
- Animasi ringan: kartu muncul dengan fade-in, kartu Habis berdenyut pelan (pulse), toast "Berhasil disimpan".
- Tab navigasi Monitoring | Riwayat berbentuk pil (pill) di bawah heading.
- Mendukung tampilan HP terlebih dahulu (mobile-first), karena admin kemungkinan besar memantau dari HP.

## Arsitektur teknis & deploy Vercel

Frontend statis (HTML + Tailwind CSS + JavaScript) dan backend serverless sama-sama di-deploy di Vercel; data disimpan di Supabase, dan penjadwal eksternal memicu pengecekan sewa habis tiap 5 menit.

&#91;embedded content: arsitektur Lailyeeaah · 7 komponen\]

Browser hanya untuk melihat dan mengelola data; pengiriman WhatsApp sepenuhnya terjadi di server, jadi tetap jalan meski web tidak dibuka.

| Lapisan | Pilihan | Alasan |
| --- | --- | --- |
| Tampilan | HTML + Tailwind CSS (build via Tailwind CLI) | Sesuai permintaan, ringan, mudah di-styling pink-hijau |
| Interaksi | JavaScript + Alpine.js | Countdown, modal, tab tanpa framework berat |
| Ikon & animasi | Lucide Icons, animasi Tailwind | Mempercantik tanpa menambah berat |
| Backend | Vercel Serverless Functions (`/api`, Node.js) | Ikut ter-deploy bersama web, gratis |
| Database | Supabase (PostgreSQL, paket gratis) | Data tidak hilang, ada dashboard |
| Penjadwal | cron-job.org (gratis) | Bisa tiap 5 menit, Vercel Hobby hanya sekali sehari |
| WhatsApp | Fonnte API | Paling cepat disiapkan |
| Login admin | Password di env var + cookie sesi | Cukup untuk satu pengguna |

### Struktur folder

```
lailyeeaah/
├─ index.html          # Monitoring
├─ riwayat.html        # Riwayat
├─ login.html
├─ src/input.css       # Tailwind
├─ js/app.js           # countdown, form, Done
├─ api/
│  ├─ rentals.js       # CRUD sewa
│  ├─ packages.js      # dropdown harga
│  ├─ login.js
│  └─ check-expired.js # cek habis + kirim WA
├─ tailwind.config.js
└─ vercel.json
```

### Environment variable di Vercel

`SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `FONNTE_TOKEN`, `ADMIN_WA_NUMBER`, `ADMIN_PASSWORD`, `CRON_SECRET`.

### Langkah deploy

1. Push kode ke GitHub.
2. Import repo di Vercel, isi environment variable di atas, deploy.
3. Buat tabel di Supabase sesuai Model data.
4. Daftar Fonnte, scan QR dengan nomor WA pengirim, salin token.
5. Buat job di cron-job.org: `GET https://<domain>.vercel.app/api/check-expired?key=<CRON_SECRET>` setiap 5 menit.

## Model data

Cukup dua tabel di database (Supabase/PostgreSQL). Semua waktu disimpan dalam UTC dan ditampilkan dalam WIB (Asia/Jakarta).

### Tabel `rentals`

| Kolom | Tipe | Keterangan |
| --- | --- | --- |
| id | uuid | Primary key |
| nama | text | Nama pelanggan |
| no\_wa | text, nullable | Format 628xxxxxxxxxx |
| device | text | Perangkat pelanggan |
| tanggal\_sewa | timestamptz | Mulai sewa |
| durasi\_nilai | integer | Mis. 30 |
| durasi\_satuan | text | hari / minggu / bulan |
| tanggal\_berakhir | timestamptz | Dihitung otomatis saat simpan |
| paket\_harga\_id | uuid | Relasi ke `price_packages` |
| harga | integer | Harga saat transaksi (Rupiah), disalin dari paket |
| status | text | aktif / selesai |
| notif\_terkirim | boolean | Default false |
| notif\_dikirim\_pada | timestamptz, nullable | Waktu WA terkirim |
| notif\_percobaan | integer | Jumlah percobaan kirim, default 0 |
| selesai\_pada | timestamptz, nullable | Diisi saat tombol Done ditekan |
| created\_at | timestamptz | Waktu input |

Status "Hampir habis" dan "Habis" tidak disimpan; dihitung dari `tanggal_berakhir` saat ditampilkan.

### Tabel `price_packages` (isi dropdown harga)

| Kolom | Tipe | Contoh |
| --- | --- | --- |
| id | uuid | — |
| nama\_paket | text | "1 Bulan" |
| harga | integer | 25000 |
| aktif | boolean | true |

## Non-fungsional, kriteria penerimaan & milestone

### Kebutuhan non-fungsional

- Halaman Monitoring tampil < 2 detik di koneksi 4G.
- Notif WA terkirim maksimal 5–10 menit setelah sewa habis.
- Tidak ada notif ganda untuk sewa yang sama.
- Halaman dilindungi login admin; endpoint `/api/check-expired` dilindungi secret key.
- Semua token & kunci API hanya ada di environment variable Vercel.
- Waktu ditampilkan dalam WIB.

### Kriteria penerimaan

- [ ] Admin bisa menambah sewa dengan nama, device, tanggal, durasi, dan harga dari dropdown.
- [ ] Setiap pelanggan tampil dalam kartu terpisah dengan countdown yang berkurang sendiri.
- [ ] Sewa tes 1 hari dengan tanggal sewa diundur ke kemarin memicu pesan WA dalam ≤ 10 menit setelah habis, tanpa web dibuka.
- [ ] Tombol Done memindahkan kartu dari Monitoring ke Riwayat.
- [ ] Riwayat menampilkan semua sewa selesai beserta status notif WA.
- [ ] Heading "Lailyeeaah" dan warna pink + hijau soft tampil di semua halaman, rapi di HP dan laptop.
- [ ] Web dapat diakses publik lewat domain Vercel.

### Milestone

1. Setup proyek, Tailwind, Supabase, deploy kosong ke Vercel — hari 1.
2. Form tambah sewa, kartu + countdown, tombol Done — hari 2–3.
3. Halaman Riwayat, pencarian, filter — hari 4.
4. Integrasi Fonnte + endpoint cek habis + cron-job.org — hari 5.
5. Login admin, polishing UI & animasi, uji di HP — hari 6.
6. Uji akhir dengan sewa tes yang sudah lewat waktu, go-live — hari 7.

### Sumber

- [Vercel — Cron Jobs usage and pricing](https://vercel.com/docs/cron-jobs/usage-and-pricing)
- [Fonnte — dokumentasi API](https://docs.fonnte.com/token-api-key/)
