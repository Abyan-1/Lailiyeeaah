-- Lailyeeaah — skema database Supabase (PostgreSQL)
-- Jalankan di Supabase Dashboard → SQL Editor → New query → Run.
-- Semua waktu disimpan UTC (timestamptz); tampilan WIB diatur di aplikasi.

create extension if not exists "pgcrypto";

-- ===================== Tabel paket harga (dropdown) =====================
create table if not exists public.price_packages (
  id uuid primary key default gen_random_uuid(),
  nama_paket text not null,
  tipe_akun text not null default 'pro_sharing',  -- pro_sharing / pro_privat / max_sharing / max_privat
  harga integer not null check (harga >= 0),
  aktif boolean not null default true
);

-- ===================== Tabel sewa =====================
create table if not exists public.rentals (
  id uuid primary key default gen_random_uuid(),
  nama text not null check (char_length(nama) <= 50),
  no_wa text,                                   -- format 628xxxxxxxxxx, boleh null
  email_pelanggan text,                         -- email pembeli/pelanggan, boleh null
  device text not null,
  tipe_akun text,                               -- pro_sharing / pro_privat / max_sharing / max_privat
  email_akun text,                              -- akun email Claude yang digunakan
  status_bayar text check (status_bayar in ('sudah_bayar','dana_talangan')), -- opsional
  tanggal_sewa timestamptz not null,
  durasi_nilai integer not null check (durasi_nilai >= 1),
  durasi_satuan text not null check (durasi_satuan in ('hari','minggu','bulan','tahun')),
  tanggal_berakhir timestamptz not null,        -- dihitung server saat simpan
  paket_harga_id uuid references public.price_packages (id),
  harga integer not null,                       -- disalin dari paket saat transaksi
  status text not null default 'aktif' check (status in ('aktif','selesai')),
  notif_peringatan_terkirim boolean not null default false, -- Peringatan "hampir habis" ke admin
  notif_peringatan_pada timestamptz,
  notif_terkirim boolean not null default false,            -- Notif "sewa habis" ke admin
  notif_dikirim_pada timestamptz,
  notif_percobaan integer not null default 0,               -- jumlah gagal berturut-turut
  notif_error text,                                         -- alasan gagal terakhir pengiriman notifikasi
  selesai_pada timestamptz,
  created_at timestamptz not null default now()
);

-- Index untuk query cron: cari sewa aktif yang sudah habis & belum dinotif
create index if not exists idx_rentals_expired
  on public.rentals (status, notif_terkirim, tanggal_berakhir);

-- ===================== Tabel Web Push Subscriptions =====================
create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  endpoint text unique not null,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now()
);

create index if not exists idx_push_subscriptions_endpoint
  on public.push_subscriptions (endpoint);

-- ===================== Tabel Pesan Chat Bot Lailyeeaah =====================
create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  pengirim text not null check (pengirim in ('bot', 'admin')),
  isi text not null,
  rental_id uuid references public.rentals (id) on delete set null,
  jenis text check (jenis in ('peringatan', 'habis', 'info', 'balasan')),
  dibaca boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists idx_chat_messages_created_at
  on public.chat_messages (created_at);

-- ===================== Keamanan =====================
-- Aktifkan RLS tanpa policy: anon/public key TIDAK bisa membaca apa pun.
-- Server memakai service_role key yang melewati RLS.
alter table public.rentals enable row level security;
alter table public.price_packages enable row level security;
alter table public.push_subscriptions enable row level security;
alter table public.chat_messages enable row level security;

-- ===================== Seed paket harga awal (silakan ubah) =====================
insert into public.price_packages (nama_paket, tipe_akun, harga) values
  -- Harian
  ('1 Hari (Pro Sharing)',  'pro_sharing', 35000),
  ('1 Hari (Max Sharing)',  'max_sharing', 45000),
  -- Mingguan
  ('1 Minggu',              'pro_sharing', 150000),
  ('1 Minggu',              'pro_sharing', 180000),
  ('1 Minggu',              'max_sharing', 250000),
  -- Bulanan
  ('1 Bulan',               'pro_privat',  250000),
  ('1 Bulan',               'pro_privat',  285000),
  ('1 Bulan',               'pro_privat',  290000),
  ('1 Bulan (Max Privat)',  'max_privat',  1000000)
on conflict do nothing;
