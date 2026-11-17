// Logika notifikasi Bot Lailyeeaah & Web Push
const { formatWIB, formatRupiah, formatTipeAkun } = require("./util");

// Ambil env var dan buang spasi / \r / tanda kutip
function env(nama) {
  return (process.env[nama] || "").replace(/\r/g, "").trim().replace(/^["']|["']$/g, "");
}

function cekKonfigurasi() {
  const masalah = [];
  if (!env("SUPABASE_URL")) masalah.push("SUPABASE_URL kosong");
  if (!env("SUPABASE_SERVICE_KEY")) masalah.push("SUPABASE_SERVICE_KEY kosong");
  if (!env("VAPID_PUBLIC_KEY")) masalah.push("VAPID_PUBLIC_KEY kosong");
  if (!env("VAPID_PRIVATE_KEY")) masalah.push("VAPID_PRIVATE_KEY kosong");
  let vapidSub = env("VAPID_SUBJECT");
  if (!vapidSub) {
    masalah.push("VAPID_SUBJECT kosong (contoh: mailto:admin@domain.com)");
  }
  if (!env("CRON_SECRET")) masalah.push("CRON_SECRET kosong");
  return masalah;
}

// Berapa menit sebelum habis peringatan "hampir habis" dikirim (default 10 menit)
function peringatanMenit() {
  const n = parseInt(env("PERINGATAN_MENIT"), 10);
  return n > 0 ? n : 10;
}

function sisaTeks(ms) {
  const menit = Math.max(0, Math.round(ms / 60000));
  if (menit < 60) return `${menit} menit`;
  const jam = Math.floor(menit / 60);
  if (jam < 24) return `${jam} jam ${menit % 60} menit`;
  return `${Math.floor(jam / 24)} hari ${jam % 24} jam`;
}

// jenis: "peringatan" | "habis"
function buatPesan(r, jenis) {
  const judul =
    jenis === "habis"
      ? "📢 SEWA HABIS — Lailyeeaah"
      : `⚠️ SEWA HAMPIR HABIS — sisa ${sisaTeks(new Date(r.tanggal_berakhir) - Date.now())}`;
  const baris = [judul, "", `Nama   : ${r.nama}`, `Device : ${r.device}`];
  if (r.tipe_akun) baris.push(`Layanan: ${formatTipeAkun(r.tipe_akun)}`);
  if (r.email_akun) baris.push(`Akun   : ${r.email_akun}`);
  if (r.email_pelanggan) baris.push(`Email  : ${r.email_pelanggan}`);
  if (r.no_wa) baris.push(`WA Cust: ${r.no_wa}`);
  baris.push(
    `Mulai  : ${formatWIB(r.tanggal_sewa)}`,
    `Durasi : ${r.durasi_nilai} ${r.durasi_satuan}`,
    `Harga  : Rp${formatRupiah(r.harga)}`,
    `Habis  : ${formatWIB(r.tanggal_berakhir)}`,
    "",
    jenis === "habis"
      ? "Segera konfirmasi perpanjangan atau cabut akses ya."
      : "Siap-siap konfirmasi perpanjangan ke pelanggan ya."
  );
  return baris.join("\n");
}

module.exports = {
  env,
  cekKonfigurasi,
  peringatanMenit,
  buatPesan,
};
