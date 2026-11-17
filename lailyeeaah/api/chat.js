// API Ruang Chat Bot Lailyeeaah
// Wajib login admin
// GET /api/chat?after=<ISO>  → daftar pesan terbaru (lama → baru, maks 100) + unreadCount
// POST /api/chat             → admin mengirim pesan (pengirim='admin')
// PUT /api/chat?action=read  → tandai semua pesan dibaca
const { getSupabase, requireAuth } = require("../lib/util");

module.exports = async (req, res) => {
  if (!requireAuth(req, res)) return;

  let supabase;
  try {
    supabase = getSupabase();
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }

  try {
    // ---------- GET: Daftar pesan & jumlah belum dibaca ----------
    if (req.method === "GET") {
      const after = req.query.after;

      let messages = [];
      if (after) {
        // Polling delta: ambil hanya pesan baru setelah timestamp ISO
        const { data, error } = await supabase
          .from("chat_messages")
          .select("*")
          .gt("created_at", after)
          .order("created_at", { ascending: true })
          .limit(100);

        if (error) throw error;
        messages = data || [];
      } else {
        // Load awal: ambil 100 pesan terakhir, urutkan lama -> baru
        const { data, error } = await supabase
          .from("chat_messages")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(100);

        if (error) throw error;
        messages = (data || []).reverse();
      }

      // Hitung total pesan yang belum dibaca (biasanya dari bot)
      const { count: unreadCount, error: cErr } = await supabase
        .from("chat_messages")
        .select("id", { count: "exact", head: true })
        .eq("dibaca", false);

      if (cErr) throw cErr;

      return res.status(200).json({
        data: messages,
        unreadCount: unreadCount || 0,
      });
    }

    // ---------- POST: Admin mengirim pesan ----------
    if (req.method === "POST") {
      const { isi, rental_id } = req.body || {};
      if (!isi || !String(isi).trim()) {
        return res.status(400).json({ error: "Isi pesan tidak boleh kosong" });
      }

      const { data, error } = await supabase
        .from("chat_messages")
        .insert({
          pengirim: "admin",
          isi: String(isi).trim(),
          rental_id: rental_id || null,
          jenis: "balasan",
          dibaca: true, // Pesan yang diketik admin sendiri sudah otomatis terbaca
        })
        .select()
        .single();

      if (error) throw error;
      return res.status(201).json({ data });
    }

    // ---------- PUT: Tandai pesan sebagai dibaca ----------
    if (req.method === "PUT") {
      const action = req.query.action || (req.body && req.body.action);
      if (action === "read") {
        const { error } = await supabase
          .from("chat_messages")
          .update({ dibaca: true })
          .eq("dibaca", false);

        if (error) throw error;
        return res.status(200).json({ ok: true });
      }

      return res.status(400).json({ error: "Aksi tidak dikenali" });
    }

    res.setHeader("Allow", "GET, POST, PUT");
    return res.status(405).json({ error: "Method tidak diizinkan" });
  } catch (e) {
    return res.status(500).json({ error: e.message || "Terjadi kesalahan server" });
  }
};
