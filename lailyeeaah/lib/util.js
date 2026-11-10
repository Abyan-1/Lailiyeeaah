// Helper bersama untuk semua serverless function Lailyeeaah
const crypto = require("crypto");
const { createClient } = require("@supabase/supabase-js");

const COOKIE_NAME = "laily_session";

function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) {
    throw new Error("SUPABASE_URL / SUPABASE_SERVICE_KEY belum diset di environment variable");
  }
  return createClient(url, key, { auth: { persistSession: false } });
}

// Token sesi = HMAC dari string tetap memakai ADMIN_PASSWORD sebagai kunci.
// Cukup aman untuk satu admin: token hanya valid selama password tidak diganti.
function sessionToken() {
  return crypto
    .createHmac("sha256", process.env.ADMIN_PASSWORD || "no-password")
    .update("lailyeeaah-admin-session")
    .digest("hex");
}

function parseCookies(req) {
  const header = req.headers.cookie || "";
  const out = {};
  header.split(";").forEach((part) => {
    const idx = part.indexOf("=");
    if (idx > -1) out[part.slice(0, idx).trim()] = decodeURIComponent(part.slice(idx + 1).trim());
  });
  return out;
}

function isAuthed(req) {
  const cookies = parseCookies(req);
  const token = cookies[COOKIE_NAME];
  if (!token) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(token), Buffer.from(sessionToken()));
  } catch {
    return false;
  }
}

function requireAuth(req, res) {
  if (!isAuthed(req)) {
    res.status(401).json({ error: "Belum login" });
    return false;
  }
  return true;
}

function setSessionCookie(res) {
  const maxAge = 60 * 60 * 24 * 30; // 30 hari
  res.setHeader(
    "Set-Cookie",
    `${COOKIE_NAME}=${sessionToken()}; Path=/; HttpOnly; SameSite=Lax; Secure; Max-Age=${maxAge}`
  );
}

function clearSessionCookie(res) {
  res.setHeader("Set-Cookie", `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Secure; Max-Age=0`);
}

// Hitung tanggal berakhir = tanggal sewa + durasi (hari / minggu / bulan)
function hitungTanggalBerakhir(tanggalSewaISO, nilai, satuan) {
  const d = new Date(tanggalSewaISO);
  if (isNaN(d.getTime())) throw new Error("Tanggal sewa tidak valid");
  const n = parseInt(nilai, 10);
  if (!n || n < 1) throw new Error("Durasi minimal 1");
  if (satuan === "hari") d.setUTCDate(d.getUTCDate() + n);
  else if (satuan === "minggu") d.setUTCDate(d.getUTCDate() + n * 7);
  else if (satuan === "bulan") d.setUTCMonth(d.getUTCMonth() + n);
  else throw new Error("Satuan durasi harus hari / minggu / bulan");
  return d.toISOString();
}

// Format waktu ke WIB untuk isi pesan WhatsApp
function formatWIB(iso) {
  if (!iso) return "-";
  return new Intl.DateTimeFormat("id-ID", {
    timeZone: "Asia/Jakarta",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(iso)) + " WIB";
}

function formatRupiah(angka) {
  return new Intl.NumberFormat("id-ID").format(angka || 0);
}

module.exports = {
  getSupabase,
  requireAuth,
  isAuthed,
  setSessionCookie,
  clearSessionCookie,
  hitungTanggalBerakhir,
  formatWIB,
  formatRupiah,
};
