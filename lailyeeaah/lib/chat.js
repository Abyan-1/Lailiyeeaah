// Chat Bot Helper
const { getSupabase } = require("./util");
const { kirimPushKeSemua } = require("./push");

/**
 * Mengirim pesan dari Bot Lailyeeaah ke admin.
 * Pesan disimpan terlebih dahulu ke tabel chat_messages (sumber kebenaran).
 * Setelah tersimpan, push notification dikirimkan sebagai pemberitahu.
 *
 * @param {Object} param
 * @param {string} param.isi - Isi teks pesan bot
 * @param {string} [param.rental_id] - UUID sewa terkait (jika ada)
 * @param {string} [param.jenis] - 'peringatan' | 'habis' | 'info' | 'balasan'
 * @returns {Promise<{data: Object, push: Object}>}
 */
async function kirimPesanBot({ isi, rental_id, jenis }) {
  if (!isi || !String(isi).trim()) {
    throw new Error("Isi pesan bot wajib diisi");
  }

  const supabase = getSupabase();
  const jenisValid = ["peringatan", "habis", "info", "balasan"].includes(jenis) ? jenis : "info";

  // 1. Simpan pesan ke database terlebih dahulu (sumber kebenaran)
  const { data: pesan, error } = await supabase
    .from("chat_messages")
    .insert({
      pengirim: "bot",
      isi: String(isi).trim(),
      rental_id: rental_id || null,
      jenis: jenisValid,
      dibaca: false,
    })
    .select()
    .single();

  if (error) {
    throw new Error(`Gagal menyimpan pesan bot ke database: ${error.message}`);
  }

  // 2. Tentukan judul dan ringkasan body push notification
  let title = "💬 Bot Lailyeeaah";
  if (jenisValid === "habis") {
    title = "📢 SEWA HABIS — Lailyeeaah";
  } else if (jenisValid === "peringatan") {
    title = "⚠️ SEWA HAMPIR HABIS — Lailyeeaah";
  }

  // Ambil intisari pesan untuk ringkasan push (maksimal ~120 karakter)
  const baris = isi.split("\n").map((b) => b.trim()).filter(Boolean);
  const body = baris.slice(0, 3).join(" • ").slice(0, 140);

  // 3. Kirim push notification ke browser/HP admin
  let pushResult = { terkirim: 0, gagal: 0, dihapus: 0, total: 0 };
  try {
    pushResult = await kirimPushKeSemua({
      title,
      body,
      url: `/chat#msg-${pesan.id}`,
      tag: `sewa-${rental_id || "bot"}`,
    });
  } catch (pushErr) {
    console.error("[chat] Push notification gagal dikirim:", pushErr.message);
    pushResult.error = pushErr.message;
  }

  return {
    data: pesan,
    push: pushResult,
  };
}

module.exports = {
  kirimPesanBot,
};
