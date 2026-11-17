// Web Push Notification Helper (VAPID)
const webpush = require("web-push");
const { getSupabase } = require("./util");

function env(nama) {
  return (process.env[nama] || "").replace(/\r/g, "").trim();
}

function initVapid() {
  const pub = env("VAPID_PUBLIC_KEY");
  const priv = env("VAPID_PRIVATE_KEY");
  const sub = env("VAPID_SUBJECT") || "mailto:admin@lailyeeaah.local";

  if (!pub || !priv) {
    throw new Error("VAPID_PUBLIC_KEY dan VAPID_PRIVATE_KEY wajib diset di environment variable");
  }

  webpush.setVapidDetails(sub, pub, priv);
  return { pub, priv, sub };
}

/**
 * Mengirim notifikasi Web Push ke semua subscriber yang terdaftar di database.
 * Jika endpoint mengembalikan status 404 atau 410 (kedaluwarsa/unsubscribed),
 * subscription tersebut otomatis dihapus dari database.
 *
 * @param {Object|string} payload - Objek payload { title, body, url, tag, icon, badge }
 * @returns {Promise<{terkirim: number, gagal: number, dihapus: number, total: number}>}
 */
async function kirimPushKeSemua(payload) {
  const ringkasan = { terkirim: 0, gagal: 0, dihapus: 0, total: 0 };

  try {
    initVapid();
  } catch (err) {
    console.error("[push] Inisialisasi VAPID gagal:", err.message);
    return { ...ringkasan, error: err.message };
  }

  let supabase;
  try {
    supabase = getSupabase();
  } catch (err) {
    console.error("[push] Supabase gagal:", err.message);
    return { ...ringkasan, error: err.message };
  }

  const { data: subs, error } = await supabase
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth");

  if (error) {
    console.error("[push] Gagal membaca push_subscriptions:", error.message);
    return { ...ringkasan, error: error.message };
  }

  if (!subs || subs.length === 0) {
    return ringkasan;
  }

  ringkasan.total = subs.length;
  const payloadStr = typeof payload === "string" ? payload : JSON.stringify(payload);

  const promises = subs.map(async (sub) => {
    const pushSubscription = {
      endpoint: sub.endpoint,
      keys: {
        p256dh: sub.p256dh,
        auth: sub.auth,
      },
    };

    try {
      await webpush.sendNotification(pushSubscription, payloadStr);
      ringkasan.terkirim++;
    } catch (err) {
      const statusCode = err.statusCode || (err.response && err.response.statusCode);
      if (statusCode === 404 || statusCode === 410) {
        // Subscription kedaluwarsa / sudah dicabut, hapus dari database
        ringkasan.dihapus++;
        try {
          await supabase.from("push_subscriptions").delete().eq("id", sub.id);
        } catch (delErr) {
          console.error(`[push] Gagal menghapus subscription ${sub.id}:`, delErr.message);
        }
      } else {
        ringkasan.gagal++;
        console.error(`[push] Gagal kirim ke ${sub.endpoint.slice(0, 35)}...:`, err.message);
      }
    }
  });

  await Promise.allSettled(promises);
  return ringkasan;
}

module.exports = {
  env,
  initVapid,
  kirimPushKeSemua,
};
