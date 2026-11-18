-- Lailyeeaah — MIGRASI v5 (status pembayaran opsional)
-- Jalankan SEKALI di Supabase → SQL Editor → New query → Run.
-- Aman dijalankan ulang (pakai "if not exists").

alter table public.rentals add column if not exists status_bayar text;

alter table public.rentals drop constraint if exists rentals_status_bayar_check;
alter table public.rentals add constraint rentals_status_bayar_check
  check (status_bayar is null or status_bayar in ('sudah_bayar','dana_talangan'));
