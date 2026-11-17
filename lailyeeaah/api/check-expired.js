// GET /api/check-expired?key=<CRON_SECRET>
// Dipanggil cron-job.org setiap 5 menit.
// Notifikasi dikirimkan ke ruang chat "Bot Lailyeeaah" & Web Push admin, dua tahap:
//   1. PERINGATAN  — sewa akan habis dalam PERINGATAN_MENIT (default 10 menit)
//   2. HABIS       — sewa sudah melewati tanggal_berakhir
// Masing-masing hanya terkirim sekali (ditandai di database).
// Pesan bot di database adalah sumber kebenaran (sewa dianggap dinotif begitu pesan tersimpan).
// Push notification hanya pemberitahu. Jika push gagal, pesan tetap tersimpan di chat.
const { getSupabase } = require("../lib/util");
const { env, cekKonfigurasi, peringatanMenit, buatPesan } = require("../lib/notif");
const { kirimPesanBot } = require("../lib/chat");

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
        // Gagal menyimpan pesan ke database: catat error & coba lagi putaran berikutnya
        const pesanGagal = err.message || "Gagal mengirim pesan bot";
        hasil.gagal++;
        await supabase
          .from("rentals")
          .update({
            notif_percobaan: (r.notif_percobaan || 0) + 1,
            notif_error: pesanGagal,
          })
          .eq("id", r.id);

        hasil.detail.push({
          nama: r.nama,
          jenis,
          status: "gagal",
          alasan: pesanGagal,
        });
      }
    }

    return res.status(200).json(hasil);
  } catch (e) {
    return res.status(500).json({ error: e.message || "Terjadi kesalahan server", ...hasil });
  }
};
