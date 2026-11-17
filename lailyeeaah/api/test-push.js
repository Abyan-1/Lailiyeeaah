// GET /api/test-push?key=<CRON_SECRET> atau via login admin
// Alat diagnosa & pengujian sistem notifikasi:
// 1. Mengecek semua environment variable (Supabase, VAPID, CRON_SECRET)
// 2. Mengecek koneksi database & jumlah push subscriptions
// 3. Menampilkan sewa yang seharusnya dinotif saat ini
// 4. Mengirim 1 pesan bot tes ke ruang chat + Web Push notification
const { getSupabase, isAuthed } = require("../lib/util");
const { env, cekKonfigurasi, peringatanMenit } = require("../lib/notif");
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
        error: "Akses ditolak: wajib login admin atau sertakan ?key=<CRON_SECRET>",
      });
    }

    const laporan = { waktu_server: new Date().toISOString(), langkah: {} };

    // 1. Konfigurasi
    const masalah = cekKonfigurasi();
    laporan.langkah["1_konfigurasi"] = masalah.length ? { ok: false, masalah } : { ok: true };

    let supabase;
    try {
      supabase = getSupabase();
    } catch (e) {
      laporan.langkah["2_database"] = { ok: false, error: e.message };
      return res.status(500).json(laporan);
    }

    // 2. Database & Subscription
    try {
      const [rentalsRes, subsRes, chatRes] = await Promise.all([
        supabase
          .from("rentals")
          .select("nama, tanggal_berakhir, notif_terkirim, notif_peringatan_terkirim, notif_percobaan, notif_error")
          .eq("status", "aktif")
          .order("tanggal_berakhir", { ascending: true })
          .limit(50),
        supabase.from("push_subscriptions").select("id, user_agent, created_at"),
        supabase.from("chat_messages").select("id", { count: "exact", head: true }),
      ]);

      if (rentalsRes.error) throw rentalsRes.error;
      if (subsRes.error) throw subsRes.error;

      laporan.langkah["2_database"] = {
        ok: true,
        sewa_aktif: rentalsRes.data.length,
        total_subscriber_push: (subsRes.data || []).length,
        total_pesan_chat: chatRes.count ?? "n/a",
        subscribers: (subsRes.data || []).map((s) => ({
          id: s.id,
          user_agent: s.user_agent,
          created_at: s.created_at,
        })),
      };

      const batas = Date.now() + peringatanMenit() * 60000;
      laporan.langkah["3_seharusnya_dinotif"] = rentalsRes.data
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
        saran:
          "Jika tabel push_subscriptions atau chat_messages belum ada, jalankan supabase/migrasi-v4-push-chat.sql di SQL Editor Supabase.",
      };
    }

    // 4. Kirim 1 pesan bot tes ke ruang chat + Web Push
    try {
      const isiTes =
        "✅ Tes notifikasi Lailyeeaah berhasil.\nPesan bot tersimpan di ruang chat dan Web Push dikirimkan ke browser/HP!";
      const hasil = await kirimPesanBot({
        isi: isiTes,
        jenis: "info",
      });

      laporan.langkah["4_kirim_tes_bot_dan_push"] = {
        ok: true,
        chat_message_id: hasil.data?.id,
        push_result: hasil.push,
        pesan:
          hasil.push.total === 0
            ? "Pesan tersimpan di chat, tetapi belum ada browser yang aktif mendaftar push (klik 'Aktifkan Notifikasi' di web)."
            : `Pesan tersimpan di chat & push terkirim ke ${hasil.push.terkirim}/${hasil.push.total} subscriber.`,
      };
    } catch (e) {
      laporan.langkah["4_kirim_tes_bot_dan_push"] = {
        ok: false,
        error: e.message,
      };
    }

    return res.status(200).json(laporan);
  } catch (fatalErr) {
    console.error("[test-push] Fatal error:", fatalErr);
    return res.status(500).json({
      error: fatalErr.message || "Terjadi kesalahan internal pada test-push",
    });
  }
};
