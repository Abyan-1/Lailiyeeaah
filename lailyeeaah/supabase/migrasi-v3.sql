-- Lailyeeaah — MIGRASI v3 (notif admin 2 tahap)
-- Jalankan SEKALI di Supabase → SQL Editor → New query → Run.
-- Aman dijalankan walau sebagian kolom sudah ada (pakai "if not exists").

-- Kolom dari versi tipe akun / email (kalau tabel dibuat dari schema lama)
alter table public.price_packages add column if not exists tipe_akun text not null default 'pro_sharing';
alter table public.rentals add column if not exists email_pelanggan text;
alter table public.rentals add column if not exists tipe_akun text;
alter table public.rentals add column if not exists email_akun text;

-- Kolom baru untuk notif 2 tahap
alter table public.rentals add column if not exists notif_peringatan_terkirim boolean not null default false;
alter table public.rentals add column if not exists notif_peringatan_pada timestamptz;
alter table public.rentals add column if not exists notif_error text;

-- Izinkan satuan "tahun"
alter table public.rentals drop constraint if exists rentals_durasi_satuan_check;
alter table public.rentals add constraint rentals_durasi_satuan_check
  check (durasi_satuan in ('hari','minggu','bulan','tahun'));

-- Buka kembali sewa aktif yang dulu "macet" karena gagal 3x atau ditandai terkirim
-- padahal pesan HABIS belum pernah dikirim (bug versi sebelumnya).
update public.rentals
set notif_percobaan = 0,
    notif_error = null,
    notif_terkirim = false,
    notif_peringatan_terkirim = case when tanggal_berakhir <= now() then true else false end
where status = 'aktif';
