// GET /api/check-expired?key=<CRON_SECRET>
// Dipanggil cron-job.org setiap 5 menit.
// Mencari sewa aktif yang sudah habis & belum dinotif, lalu kirim WA via Fonnte.
// - Berhasil → notif_terkirim = true + waktu kirim disimpan (tidak akan dobel)
// - Gagal    → notif_percobaan + 1, dicoba lagi di putaran berikutnya (maks 3x)
const { getSupabase, formatWIB, formatRupiah } = require("../lib/util");

const MAX_PERCOBAAN = 3;

module.exports = async (req, res) => {
  // Lindungi endpoint dengan secret key
  const key = req.query.key || req.headers["x-cron-key"];
  if (!process.env.CRON_SECRET || key !== process.env.CRON_SECRET) {
    return res.status(401).json({ error: "Secret key salah" });
  }
  if (!process.env.FONNTE_TOKEN || !process.env.ADMIN_WA_NUMBER) {
    return res.status(500).json({ error: "FONNTE_TOKEN / ADMIN_WA_NUMBER belum diset" });
  }

  let supabase;
  try {
    supabase = getSupabase();
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }

  const now = new Date().toISOString();
  const hasil = { dicek_pada: now, terkirim: 0, gagal: 0, detail: [] };

  try {
    const { data: expired, error } = await supabase
      .from("rentals")
      .select("*")
      .eq("status", "aktif")
      .eq("notif_terkirim", false)
      .lt("notif_percobaan", MAX_PERCOBAAN)
      .lte("tanggal_berakhir", now);
    if (error) throw error;

    for (const r of expired || []) {
      const pesan = buatPesan(r);

      // Penerima: admin selalu; pelanggan ikut jika punya nomor WA
      const target = [process.env.ADMIN_WA_NUMBER, r.no_wa].filter(Boolean).join(",");

      const sukses = await kirimFonnte(target, pesan);

      if (sukses) {
        await supabase
          .from("rentals")
          .update({
            notif_terkirim: true,
            notif_dikirim_pada: new Date().toISOString(),
            notif_percobaan: (r.notif_percobaan || 0) + 1,
          })
          .eq("id", r.id);
        hasil.terkirim++;
        hasil.detail.push({ id: r.id, nama: r.nama, status: "terkirim" });
      } else {
        await supabase
          .from("rentals")
          .update({ notif_percobaan: (r.notif_percobaan || 0) + 1 })
          .eq("id", r.id);
        hasil.gagal++;
        hasil.detail.push({
          id: r.id,
          nama: r.nama,
          status: "gagal",
          percobaan_ke: (r.notif_percobaan || 0) + 1,
        });
      }
    }

    return res.status(200).json(hasil);
  } catch (e) {
    return res.status(500).json({ error: e.message || "Terjadi kesalahan server" });
  }
};

function buatPesan(r) {
  const durasi = `${r.durasi_nilai} ${r.durasi_satuan}`;
  return [
    "📢 SEWA HABIS — Lailyeeaah",
    `Nama   : ${r.nama}`,
    `Device : ${r.device}`,
    `Mulai  : ${formatWIB(r.tanggal_sewa)}`,
    `Durasi : ${durasi}`,
    `Harga  : Rp${formatRupiah(r.harga)}`,
    `Habis  : ${formatWIB(r.tanggal_berakhir)}`,
    "Segera konfirmasi perpanjangan atau cabut akses ya.",
  ].join("\n");
}

async function kirimFonnte(target, message) {
  try {
    const resp = await fetch("https://api.fonnte.com/send", {
      method: "POST",
      headers: {
        Authorization: process.env.FONNTE_TOKEN,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ target, message }),
    });
    const json = await resp.json().catch(() => ({}));
    // Fonnte mengembalikan { status: true } saat pesan diterima antrean
    return resp.ok && json.status === true;
  } catch {
    return false;
  }
}
