// GET /api/test-wa?key=<CRON_SECRET>
// Alat diagnosa: buka URL ini di browser untuk melihat kenapa notif tidak masuk.
// 1. Mengecek semua environment variable
// 2. Mengecek koneksi & kolom database
// 3. Menampilkan sewa yang seharusnya dinotif sekarang
// 4. Mengirim 1 pesan TES ke WA admin dan menampilkan jawaban asli Fonnte
const { getSupabase } = require("../lib/util");
const { env, cekKonfigurasi, peringatanMenit, kirimKeAdmin } = require("../lib/notif");

module.exports = async (req, res) => {
  if (!env("CRON_SECRET") || req.query.key !== env("CRON_SECRET")) {
    return res.status(401).json({ error: "Secret key salah / CRON_SECRET belum diset" });
  }

  const laporan = { waktu_server: new Date().toISOString(), langkah: {} };

  // 1. Konfigurasi
  const masalah = cekKonfigurasi();
  laporan.langkah["1_konfigurasi"] = masalah.length ? { ok: false, masalah } : { ok: true };

  // 2. Database
  try {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from("rentals")
      .select("nama, tanggal_berakhir, notif_terkirim, notif_peringatan_terkirim, notif_percobaan, notif_error")
      .eq("status", "aktif")
      .order("tanggal_berakhir", { ascending: true })
      .limit(50);
    if (error) throw error;
    laporan.langkah["2_database"] = { ok: true, sewa_aktif: data.length };

    const batas = Date.now() + peringatanMenit() * 60000;
    laporan.langkah["3_seharusnya_dinotif"] = data
      .filter((r) => !r.notif_terkirim && new Date(r.tanggal_berakhir).getTime() <= batas)
      .map((r) => ({
        nama: r.nama,
        habis: r.tanggal_berakhir,
        peringatan_terkirim: r.notif_peringatan_terkirim,
        percobaan_gagal: r.notif_percobaan,
        alasan_gagal_terakhir: r.notif_error,
      }));
  } catch (e) {
    laporan.langkah["2_database"] = {
      ok: false,
      error: e.message,
      saran: "Jika error menyebut kolom tidak ada (column ... does not exist), jalankan supabase/migrasi-v3.sql di SQL Editor Supabase.",
    };
  }

  // 4. Kirim pesan tes
  if (env("FONNTE_TOKEN") && env("ADMIN_WA_NUMBER")) {
    const { ok, detail } = await kirimKeAdmin(
      "✅ Tes notifikasi Lailyeeaah berhasil.\nKalau pesan ini masuk, koneksi Fonnte sudah benar."
    );
    laporan.langkah["4_kirim_tes_ke_admin"] = ok
      ? { ok: true, pesan: "Terkirim — cek WhatsApp admin" }
      : {
          ok: false,
          jawaban_fonnte: detail,
          saran: "Cek di dashboard Fonnte: device harus berstatus CONNECTED, dan FONNTE_TOKEN harus token milik device itu.",
        };
  }

  return res.status(200).json(laporan);
};
