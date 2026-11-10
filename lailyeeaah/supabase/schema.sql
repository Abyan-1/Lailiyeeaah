-- Lailyeeaah — skema database Supabase (PostgreSQL)
-- Jalankan di Supabase Dashboard → SQL Editor → New query → Run.
-- Semua waktu disimpan UTC (timestamptz); tampilan WIB diatur di aplikasi.

create extension if not exists "pgcrypto";

-- ===================== Tabel paket harga (dropdown) =====================
create table if not exists public.price_packages (
  id uuid primary key default gen_random_uuid(),
  nama_paket text not null,
  harga integer not null check (harga >= 0),
  aktif boolean not null default true
);

-- ===================== Tabel sewa =====================
create table if not exists public.rentals (
  id uuid primary key default gen_random_uuid(),
  nama text not null check (char_length(nama) <= 50),
  no_wa text,                                   -- format 628xxxxxxxxxx, boleh null
  device text not null,
  tanggal_sewa timestamptz not null,
  durasi_nilai integer not null check (durasi_nilai >= 1),
  durasi_satuan text not null check (durasi_satuan in ('hari','minggu','bulan')),
  tanggal_berakhir timestamptz not null,        -- dihitung server saat simpan
  paket_harga_id uuid references public.price_packages (id),
  harga integer not null,                       -- disalin dari paket saat transaksi
  status text not null default 'aktif' check (status in ('aktif','selesai')),
  notif_terkirim boolean not null default false,
  notif_dikirim_pada timestamptz,
  notif_percobaan integer not null default 0,
  selesai_pada timestamptz,
  created_at timestamptz not null default now()
);

-- Index untuk query cron: cari sewa aktif yang sudah habis & belum dinotif
create index if not exists idx_rentals_expired
  on public.rentals (status, notif_terkirim, tanggal_berakhir);

-- ===================== Keamanan =====================
-- Aktifkan RLS tanpa policy: anon/public key TIDAK bisa membaca apa pun.
-- Server memakai service_role key yang melewati RLS.
alter table public.rentals enable row level security;
alter table public.price_packages enable row level security;

-- ===================== Seed paket harga awal (silakan ubah) =====================
insert into public.price_packages (nama_paket, harga) values
  ('Harian (1 Hari)', 35000),
  ('1 Minggu', 45000),
  ('1 Bulan', 250000),
  ('3 Bulan', 300000),
  ('1 Tahun', 1000000)
on conflict do nothing;
