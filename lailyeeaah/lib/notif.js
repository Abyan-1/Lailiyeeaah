// Logika notifikasi WhatsApp ke ADMIN (dipakai check-expired & test-wa)
const { formatWIB, formatRupiah, formatTipeAkun } = require("./util");

// Ambil env var dan buang spasi / \r (file .env dari Windows sering membawa \r
// yang membuat token Fonnte jadi tidak valid)
function env(nama) {
  return (process.env[nama] || "").replace(/\r/g, "").trim();
}

function cekKonfigurasi() {
  const masalah = [];
  if (!env("SUPABASE_URL")) masalah.push("SUPABASE_URL kosong");
  if (!env("SUPABASE_SERVICE_KEY")) masalah.push("SUPABASE_SERVICE_KEY kosong");
  if (!env("FONNTE_TOKEN")) masalah.push("FONNTE_TOKEN kosong");
  const wa = env("ADMIN_WA_NUMBER");
  if (!wa) masalah.push("ADMIN_WA_NUMBER kosong");
  else if (!/^62\d{8,13}$/.test(wa)) masalah.push("ADMIN_WA_NUMBER harus angka saja diawali 62, mis. 6281234567890");
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
      ? "📢 *SEWA HABIS* — Lailyeeaah"
      : `⚠️ *SEWA HAMPIR HABIS* — sisa ${sisaTeks(new Date(r.tanggal_berakhir) - Date.now())}`;
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

// Kirim ke nomor ADMIN saja. Mengembalikan { ok, detail } — detail berisi
// jawaban mentah Fonnte supaya penyebab gagal bisa dilihat.
async function kirimKeAdmin(message) {
  const form = new FormData();
  form.append("target", env("ADMIN_WA_NUMBER"));
  form.append("message", message);
  form.append("countryCode", "62");
  try {
    const resp = await fetch("https://api.fonnte.com/send", {
      method: "POST",
      headers: { Authorization: env("FONNTE_TOKEN") },
      body: form,
    });
    const teks = await resp.text();
    let json = {};
    try { json = JSON.parse(teks); } catch {}
    const ok = resp.ok && json.status === true;
    return { ok, detail: ok ? null : (json.reason || teks || `HTTP ${resp.status}`).toString().slice(0, 300) };
  } catch (e) {
    return { ok: false, detail: "Tidak bisa menghubungi Fonnte: " + e.message };
  }
}

module.exports = { env, cekKonfigurasi, peringatanMenit, buatPesan, kirimKeAdmin };
