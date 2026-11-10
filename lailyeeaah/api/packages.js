// Paket harga untuk dropdown
// GET    /api/packages            → daftar paket aktif (untuk dropdown)
// GET    /api/packages?all=1      → semua paket (untuk pengelolaan)
// POST   /api/packages            → tambah paket { nama_paket, harga }
// PUT    /api/packages?id=...     → ubah paket { nama_paket?, harga?, aktif? }
// DELETE /api/packages?id=...     → nonaktifkan paket (soft delete, agar riwayat tetap utuh)
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
    if (req.method === "GET") {
      let q = supabase.from("price_packages").select("*").order("harga", { ascending: true });
      if (!req.query.all) q = q.eq("aktif", true);
      const { data, error } = await q;
      if (error) throw error;
      return res.status(200).json({ data });
    }

    if (req.method === "POST") {
      const { nama_paket, harga, tipe_akun } = req.body || {};
      if (!nama_paket || !String(nama_paket).trim()) return res.status(400).json({ error: "Nama paket wajib" });
      const h = parseInt(harga, 10);
      if (isNaN(h) || h < 0) return res.status(400).json({ error: "Harga tidak valid" });
      const insert = { nama_paket: String(nama_paket).trim(), harga: h, aktif: true };
      if (tipe_akun) insert.tipe_akun = String(tipe_akun).trim();
      const { data, error } = await supabase
        .from("price_packages")
        .insert(insert)
        .select()
        .single();
      if (error) throw error;
      return res.status(201).json({ data });
    }

    if (req.method === "PUT") {
      const id = req.query.id;
      if (!id) return res.status(400).json({ error: "Parameter id wajib" });
      const b = req.body || {};
      const update = {};
      if (b.nama_paket !== undefined) update.nama_paket = String(b.nama_paket).trim();
      if (b.tipe_akun !== undefined) update.tipe_akun = String(b.tipe_akun).trim();
      if (b.harga !== undefined) {
        const h = parseInt(b.harga, 10);
        if (isNaN(h) || h < 0) return res.status(400).json({ error: "Harga tidak valid" });
        update.harga = h;
      }
      if (b.aktif !== undefined) update.aktif = !!b.aktif;
      const { data, error } = await supabase
        .from("price_packages")
        .update(update)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return res.status(200).json({ data });
    }

    if (req.method === "DELETE") {
      const id = req.query.id;
      if (!id) return res.status(400).json({ error: "Parameter id wajib" });
      const { error } = await supabase.from("price_packages").update({ aktif: false }).eq("id", id);
      if (error) throw error;
      return res.status(200).json({ ok: true });
    }

    res.setHeader("Allow", "GET, POST, PUT, DELETE");
    return res.status(405).json({ error: "Method tidak diizinkan" });
  } catch (e) {
    return res.status(500).json({ error: e.message || "Terjadi kesalahan server" });
  }
};
