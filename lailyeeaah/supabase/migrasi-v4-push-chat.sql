-- Lailyeeaah — MIGRASI v4 (Web Push Notification & Bot Chat)
-- Jalankan SEKALI di Supabase → SQL Editor → New query → Run.
-- Aman dijalankan walau tabel sudah ada (pakai "if not exists").

create extension if not exists "pgcrypto";

-- ===================== 1. Tabel Web Push Subscriptions =====================
create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  endpoint text unique not null,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now()
);

-- Index endpoint untuk pencarian & penghapusan cepat
create index if not exists idx_push_subscriptions_endpoint
  on public.push_subscriptions (endpoint);

-- Aktifkan RLS tanpa policy (hanya diakses via service_role dari server)
alter table public.push_subscriptions enable row level security;

-- ===================== 2. Tabel Pesan Chat Bot Lailyeeaah =====================
create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  pengirim text not null check (pengirim in ('bot', 'admin')),
  isi text not null,
  rental_id uuid references public.rentals (id) on delete set null,
  jenis text check (jenis in ('peringatan', 'habis', 'info', 'balasan')),
  dibaca boolean not null default false,
  created_at timestamptz not null default now()
);

-- Index urutan pesan untuk polling chat cepat
create index if not exists idx_chat_messages_created_at
  on public.chat_messages (created_at);

-- Index pesan belum dibaca
create index if not exists idx_chat_messages_dibaca
  on public.chat_messages (dibaca) where dibaca = false;

-- Aktifkan RLS tanpa policy (hanya diakses via service_role dari server)
alter table public.chat_messages enable row level security;

-- ===================== 3. Perbarui Komentar Kolom Rentals =====================
comment on column public.rentals.notif_error is 'Alasan gagal terakhir pengiriman notifikasi (push notification / bot)';
