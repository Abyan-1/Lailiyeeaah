// GET /api/check-expired?key=<CRON_SECRET> atau dipanggil admin yang sudah login
// Dipanggil cron-job.org setiap 5 menit atau otomatis oleh web admin saat aktif.
// Notifikasi dikirimkan ke ruang chat "Bot Lailyeeaah" & Web Push admin, dua tahap:
//   1. PERINGATAN  — sewa akan habis dalam PERINGATAN_MENIT (default 10 menit)
//   2. HABIS       — sewa sudah melewati tanggal_berakhir
// Masing-masing hanya terkirim sekali (ditandai di database).
// Pesan bot di database adalah sumber kebenaran (sewa dianggap dinotif begitu pesan tersimpan).
// Push notification hanya pemberitahu. Jika push gagal, pesan tetap tersimpan di chat.
const { getSupabase, isAuthed } = require("../lib/util");
const { env, cekKonfigurasi, peringatanMenit, buatPesan } = require("../lib/notif");
const { kirimPesanBot } = require("../lib/chat");

module.exports = async (req, res) => {
  try {
    const query = req.query || {};
    const auth = (req.headers && req.headers.authorization ? req.headers.authorization : "").replace(/^Bearer\s+/i, "");
    const key = query.key || auth;
    const isCronKeyValid = env("CRON_SECRET") && key && key === env("CRON_SECRET");
    let isAdmin = false;
    try {
      isAdmin = isAuthed(req);
    } catch {}

    if (!isCronKeyValid && !isAdmin) {
      return res.status(401).json({
        error: "Akses ditolak: wajib login admin atau menyertakan ?key=<CRON_SECRET>",
      });
    }

    const masalah = cekKonfigurasi();
    if (masalah.length) {
      return res.status(500).json({
        error: "Konfigurasi server belum lengkap: " + masalah.join(", "),
        masalah,
      });
    }

    let supabase;
    try {
      supabase = getSupabase();
    } catch (dbErr) {
      return res.status(500).json({ error: "Gagal menghubungkan database: " + dbErr.message });
    }

    const now = new Date();
    const batasPeringatan = new Date(now.getTime() + peringatanMenit() * 60000);
    const hasil = {
      dicek_pada: now.toISOString(),
      peringatan_menit: peringatanMenit(),
      terkirim: 0,
      gagal: 0,
      detail: [],
    };

    // Semua sewa aktif yang habis sebelum batas peringatan & masih ada notif yang belum terkirim
    const { data, error } = await supabase
      .from("rentals")
      .select("*")
      .eq("status", "aktif")
      .eq("notif_terkirim", false)
      .lte("tanggal_berakhir", batasPeringatan.toISOString())
      .order("tanggal_berakhir", { ascending: true });

    if (error) {
      return res.status(500).json({ error: "Database error: " + error.message });
    }

    for (const r of data || []) {
      const sudahHabis = new Date(r.tanggal_berakhir) <= now;
      let jenis = null;
      if (sudahHabis) jenis = "habis";
      else if (!r.notif_peringatan_terkirim) jenis = "peringatan";
      if (!jenis) continue; // Peringatan sudah terkirim, tunggu sampai benar-benar habis

      const waktu = new Date().toISOString();

      try {
        // Kirim ke ruang chat bot (insert ke chat_messages) + Web Push
        const isi = buatPesan(r, jenis);
        const { data: chatData, push } = await kirimPesanBot({
          isi,
          rental_id: r.id,
          jenis,
        });

        // Detail status push untuk disimpan jika ada kegagalan push
        let pushDetail = null;
        if (push && push.gagal > 0) {
          pushDetail = `Push gagal ${push.gagal}/${push.total} subscriber`;
        }

        // Karena pesan chat berhasil disimpan, sewa dianggap sudah dinotif
        const update = jenis === "habis"
          ? {
              notif_terkirim: true,
              notif_dikirim_pada: waktu,
              notif_peringatan_terkirim: true,
              notif_percobaan: 0,
              notif_error: pushDetail,
            }
          : {
              notif_peringatan_terkirim: true,
              notif_peringatan_pada: waktu,
              notif_percobaan: 0,
              notif_error: pushDetail,
            };

        const { error: uErr } = await supabase.from("rentals").update(update).eq("id", r.id);
        if (uErr) throw uErr;

        hasil.terkirim++;
        hasil.detail.push({
          nama: r.nama,
          jenis,
          status: "terkirim",
          chat_msg_id: chatData?.id,
          push,
        });
      } catch (err) {
        const pesanGagal = err.message || "Gagal mengirim pesan bot";
        hasil.gagal++;
        try {
          await supabase
            .from("rentals")
            .update({
              notif_percobaan: (r.notif_percobaan || 0) + 1,
              notif_error: pesanGagal,
            })
            .eq("id", r.id);
        } catch {}

        hasil.detail.push({
          nama: r.nama,
          jenis,
          status: "gagal",
          alasan: pesanGagal,
        });
      }
    }

    return res.status(200).json(hasil);
  } catch (fatalErr) {
    console.error("[check-expired] Fatal error:", fatalErr);
    return res.status(500).json({
      error: fatalErr.message || "Terjadi kesalahan server pada check-expired",
    });
  }
};
