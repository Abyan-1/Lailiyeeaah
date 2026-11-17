// API Manajemen Web Push Subscription
// Wajib login admin
// GET    /api/push-subscribe           → kembalikan VAPID_PUBLIC_KEY
// POST   /api/push-subscribe           → simpan / upsert subscription browser admin
// DELETE /api/push-subscribe?endpoint= → hapus subscription
const { getSupabase, requireAuth } = require("../lib/util");
const { env } = require("../lib/push");

module.exports = async (req, res) => {
  if (!requireAuth(req, res)) return;

  // ---------- GET: Ambil VAPID Public Key untuk frontend ----------
  if (req.method === "GET") {
    const vapidPublicKey = env("VAPID_PUBLIC_KEY");
    if (!vapidPublicKey) {
      return res.status(500).json({ error: "VAPID_PUBLIC_KEY belum diset di server" });
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
    const raw = req.body || {};
    const sub = raw.subscription || raw;
    const endpoint = sub.endpoint;
    const p256dh = sub.keys?.p256dh || sub.p256dh;
    const auth = sub.keys?.auth || sub.auth;
    const userAgent = raw.userAgent || req.headers["user-agent"] || null;

    if (!endpoint || !p256dh || !auth) {
      return res.status(400).json({
        error: "Subscription tidak lengkap (endpoint, p256dh, dan auth wajib ada)",
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

      if (error) throw error;
      return res.status(200).json({ ok: true, data });
    } catch (e) {
      return res.status(500).json({ error: e.message || "Gagal menyimpan subscription" });
    }
  }

  // ---------- DELETE: Hapus subscription ----------
  if (req.method === "DELETE") {
    const endpoint = req.query.endpoint || req.body?.endpoint;
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
};
