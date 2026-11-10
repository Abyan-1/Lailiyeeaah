// CRUD sewa
// GET    /api/rentals?status=aktif|selesai   → daftar sewa
// POST   /api/rentals                        → tambah sewa baru
// PUT    /api/rentals?id=...                 → edit sewa / tandai Done
// DELETE /api/rentals?id=...                 → hapus sewa (salah input)
const {
  getSupabase,
  requireAuth,
  hitungTanggalBerakhir,
} = require("../lib/util");

module.exports = async (req, res) => {
  if (!requireAuth(req, res)) return;

  let supabase;
  try {
    supabase = getSupabase();
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }

  try {
    // ---------- GET: daftar sewa ----------
    if (req.method === "GET") {
      const status = req.query.status;
      let q = supabase.from("rentals").select("*");
      if (status) q = q.eq("status", status);
      // aktif: urut dari paling cepat habis; selesai: urut terbaru
      q = status === "selesai"
        ? q.order("selesai_pada", { ascending: false })
        : q.order("tanggal_berakhir", { ascending: true });
      const { data, error } = await q;
      if (error) throw error;
      return res.status(200).json({ data });
    }

    // ---------- POST: tambah sewa ----------
    if (req.method === "POST") {
      const b = req.body || {};
      const err = validasi(b);
      if (err) return res.status(400).json({ error: err });

      // Ambil harga dari paket (sumber kebenaran harga = tabel price_packages)
      const { data: paket, error: pErr } = await supabase
        .from("price_packages")
        .select("id, harga")
        .eq("id", b.paket_harga_id)
        .single();
      if (pErr || !paket) return res.status(400).json({ error: "Paket harga tidak ditemukan" });

      const tanggal_berakhir = hitungTanggalBerakhir(b.tanggal_sewa, b.durasi_nilai, b.durasi_satuan);

      const { data, error } = await supabase
        .from("rentals")
        .insert({
          nama: String(b.nama).trim().slice(0, 50),
          no_wa: b.no_wa ? String(b.no_wa).replace(/\D/g, "") : null,
          device: String(b.device).trim(),
          tanggal_sewa: new Date(b.tanggal_sewa).toISOString(),
          durasi_nilai: parseInt(b.durasi_nilai, 10),
          durasi_satuan: b.durasi_satuan,
          tanggal_berakhir,
          paket_harga_id: paket.id,
          harga: paket.harga,
          status: "aktif",
        })
        .select()
        .single();
      if (error) throw error;
      return res.status(201).json({ data });
    }

    // ---------- PUT: edit / Done ----------
    if (req.method === "PUT") {
      const id = req.query.id;
      if (!id) return res.status(400).json({ error: "Parameter id wajib" });
      const b = req.body || {};

      // Mode Done: pindahkan ke Riwayat
      if (b.action === "done") {
        const { data, error } = await supabase
          .from("rentals")
          .update({ status: "selesai", selesai_pada: new Date().toISOString() })
          .eq("id", id)
          .select()
          .single();
        if (error) throw error;
        return res.status(200).json({ data });
      }

      // Mode edit biasa (perbaiki salah input)
      const err = validasi(b);
      if (err) return res.status(400).json({ error: err });

      const { data: paket, error: pErr } = await supabase
        .from("price_packages")
        .select("id, harga")
        .eq("id", b.paket_harga_id)
        .single();
      if (pErr || !paket) return res.status(400).json({ error: "Paket harga tidak ditemukan" });

      const tanggal_berakhir = hitungTanggalBerakhir(b.tanggal_sewa, b.durasi_nilai, b.durasi_satuan);

      const update = {
        nama: String(b.nama).trim().slice(0, 50),
        no_wa: b.no_wa ? String(b.no_wa).replace(/\D/g, "") : null,
        device: String(b.device).trim(),
        tanggal_sewa: new Date(b.tanggal_sewa).toISOString(),
        durasi_nilai: parseInt(b.durasi_nilai, 10),
        durasi_satuan: b.durasi_satuan,
        tanggal_berakhir,
        paket_harga_id: paket.id,
        harga: paket.harga,
      };
      // Jika tanggal berakhir mundur ke masa depan lagi, reset status notif
      if (new Date(tanggal_berakhir) > new Date()) {
        update.notif_terkirim = false;
        update.notif_dikirim_pada = null;
        update.notif_percobaan = 0;
      }

      const { data, error } = await supabase
        .from("rentals")
        .update(update)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return res.status(200).json({ data });
    }

    // ---------- DELETE ----------
    if (req.method === "DELETE") {
      const id = req.query.id;
      if (!id) return res.status(400).json({ error: "Parameter id wajib" });
      const { error } = await supabase.from("rentals").delete().eq("id", id);
      if (error) throw error;
      return res.status(200).json({ ok: true });
    }

    res.setHeader("Allow", "GET, POST, PUT, DELETE");
    return res.status(405).json({ error: "Method tidak diizinkan" });
  } catch (e) {
    return res.status(500).json({ error: e.message || "Terjadi kesalahan server" });
  }
};

function validasi(b) {
  if (!b.nama || !String(b.nama).trim()) return "Nama pelanggan wajib diisi";
  if (String(b.nama).trim().length > 50) return "Nama maksimal 50 karakter";
  if (!b.device || !String(b.device).trim()) return "Device wajib diisi";
  if (!b.tanggal_sewa || isNaN(new Date(b.tanggal_sewa).getTime())) return "Tanggal sewa tidak valid";
  const n = parseInt(b.durasi_nilai, 10);
  if (!n || n < 1) return "Durasi minimal 1";
  if (!["hari", "minggu", "bulan"].includes(b.durasi_satuan)) return "Satuan durasi tidak valid";
  if (!b.paket_harga_id) return "Paket harga wajib dipilih";
  if (b.no_wa && !/^\d{8,15}$/.test(String(b.no_wa).replace(/\D/g, "")))
    return "Nomor WA tidak valid (contoh: 628123456789)";
  return null;
}
