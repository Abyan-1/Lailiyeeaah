// GET /api/check-expired?key=<CRON_SECRET>
// Dipanggil cron-job.org setiap 5 menit. Notif HANYA dikirim ke WA admin, dua tahap:
//   1. PERINGATAN  — sewa akan habis dalam PERINGATAN_MENIT (default 10 menit)
//   2. HABIS       — sewa sudah melewati tanggal_berakhir
// Masing-masing hanya terkirim sekali (ditandai di database).
// Jika Fonnte gagal, akan dicoba lagi tiap putaran sampai berhasil; alasan gagal
// disimpan di kolom notif_error dan kartu diberi tanda "Notif gagal".
const { getSupabase } = require("../lib/util");
const { env, cekKonfigurasi, peringatanMenit, buatPesan, kirimKeAdmin } = require("../lib/notif");

module.exports = async (req, res) => {
  const auth = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  const key = req.query.key || auth;
  if (!env("CRON_SECRET") || key !== env("CRON_SECRET")) {
    return res.status(401).json({ error: "Secret key salah / CRON_SECRET belum diset" });
  }

  const masalah = cekKonfigurasi();
  if (masalah.length) return res.status(500).json({ error: "Konfigurasi belum lengkap", masalah });

  const supabase = getSupabase();
  const now = new Date();
  const batasPeringatan = new Date(now.getTime() + peringatanMenit() * 60000);
  const hasil = {
    dicek_pada: now.toISOString(),
    peringatan_menit: peringatanMenit(),
    terkirim: 0,
    gagal: 0,
    detail: [],
  };

  try {
    // Semua sewa aktif yang habis sebelum batas peringatan & masih ada notif yang belum terkirim
    const { data, error } = await supabase
      .from("rentals")
      .select("*")
      .eq("status", "aktif")
      .eq("notif_terkirim", false)
      .lte("tanggal_berakhir", batasPeringatan.toISOString())
      .order("tanggal_berakhir", { ascending: true });
    if (error) throw error;

    for (const r of data || []) {
      const sudahHabis = new Date(r.tanggal_berakhir) <= now;
      let jenis = null;
      if (sudahHabis) jenis = "habis";
      else if (!r.notif_peringatan_terkirim) jenis = "peringatan";
      if (!jenis) continue; // peringatan sudah terkirim, tunggu sampai benar-benar habis

      const { ok, detail } = await kirimKeAdmin(buatPesan(r, jenis));
      const waktu = new Date().toISOString();
      let update;
      if (ok) {
        update = jenis === "habis"
          ? { notif_terkirim: true, notif_dikirim_pada: waktu, notif_peringatan_terkirim: true, notif_percobaan: 0, notif_error: null }
          : { notif_peringatan_terkirim: true, notif_peringatan_pada: waktu, notif_percobaan: 0, notif_error: null };
        hasil.terkirim++;
      } else {
        update = { notif_percobaan: (r.notif_percobaan || 0) + 1, notif_error: detail };
        hasil.gagal++;
      }
      const { error: uErr } = await supabase.from("rentals").update(update).eq("id", r.id);
      hasil.detail.push({
        nama: r.nama,
        jenis,
        status: ok ? "terkirim" : "gagal",
        alasan: ok ? undefined : detail,
        error_db: uErr ? uErr.message : undefined,
      });
    }

    return res.status(200).json(hasil);
  } catch (e) {
    return res.status(500).json({ error: e.message || "Terjadi kesalahan server", ...hasil });
  }
};
