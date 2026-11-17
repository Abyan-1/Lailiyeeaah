// API Manajemen Web Push Subscription
// Wajib login admin
// GET    /api/push-subscribe           → kembalikan VAPID_PUBLIC_KEY
// POST   /api/push-subscribe           → simpan / upsert subscription browser admin
// DELETE /api/push-subscribe?endpoint= → hapus subscription
const { getSupabase, requireAuth } = require("../lib/util");

function getEnv(nama) {
  return (process.env[nama] || "").replace(/\r/g, "").trim().replace(/^["']|["']$/g, "");
}

module.exports = async (req, res) => {
  try {
    if (!requireAuth(req, res)) return;

    // ---------- GET: Ambil VAPID Public Key untuk frontend ----------
    if (req.method === "GET") {
      const vapidPublicKey = getEnv("VAPID_PUBLIC_KEY");
      if (!vapidPublicKey) {
        return res.status(500).json({
          error:
            "VAPID_PUBLIC_KEY belum diset di Vercel Environment Variables. Silakan generate kunci dengan 'npx web-push generate-vapid-keys' lalu tambahkan ke Vercel.",
        });
      }
      return res.status(200).json({ vapidPublicKey });
    }

    let supabase;
    try {
      supabase = getSupabase();
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }

    // ---------- POST: Simpan / Upsert subscription ----------
    if (req.method === "POST") {
      let raw = req.body;
      if (typeof raw === "string") {
        try {
          raw = JSON.parse(raw);
        } catch {
          raw = {};
        }
      }
      raw = raw || {};
      const sub = raw.subscription || raw;
      const endpoint = sub.endpoint;
      const p256dh = sub.keys?.p256dh || sub.p256dh;
      const auth = sub.keys?.auth || sub.auth;
      const userAgent = raw.userAgent || req.headers["user-agent"] || null;

      if (!endpoint || !p256dh || !auth) {
        return res.status(400).json({
          error: "Data subscription browser tidak lengkap (endpoint, p256dh, atau auth kosong)",
        });
      }

      try {
        const { data, error } = await supabase
          .from("push_subscriptions")
          .upsert(
            {
              endpoint,
              p256dh,
              auth,
              user_agent: userAgent,
            },
            { onConflict: "endpoint" }
          )
          .select()
          .single();

        if (error) {
          return res.status(500).json({
            error: `Gagal menyimpan ke database: ${error.message}. Pastikan file supabase/migrasi-v4-push-chat.sql sudah dijalankan di Supabase SQL Editor.`,
          });
        }
        return res.status(200).json({ ok: true, data });
      } catch (e) {
        return res.status(500).json({
          error: `Kesalahan database: ${e.message || "Gagal menyimpan subscription"}. Pastikan migrasi v4 sudah dijalankan di Supabase.`,
        });
      }
    }

    // ---------- DELETE: Hapus subscription ----------
    if (req.method === "DELETE") {
      const endpoint = req.query.endpoint || (req.body && req.body.endpoint);
      if (!endpoint) {
        return res.status(400).json({ error: "Parameter endpoint wajib diisi" });
      }

      try {
        const { error } = await supabase
          .from("push_subscriptions")
          .delete()
          .eq("endpoint", endpoint);

        if (error) throw error;
        return res.status(200).json({ ok: true });
      } catch (e) {
        return res.status(500).json({ error: e.message || "Gagal menghapus subscription" });
      }
    }

    res.setHeader("Allow", "GET, POST, DELETE");
    return res.status(405).json({ error: "Method tidak diizinkan" });
  } catch (outerErr) {
    console.error("[push-subscribe] Unhandled error:", outerErr);
    return res.status(500).json({ error: outerErr.message || "Terjadi kesalahan internal server" });
  }
};
