// POST /api/login  { password }  → set cookie sesi
// DELETE /api/login              → logout
// GET /api/login                 → cek status login
const { isAuthed, setSessionCookie, clearSessionCookie } = require("../lib/util");

module.exports = async (req, res) => {
  if (req.method === "GET") {
    return res.status(200).json({ loggedIn: isAuthed(req) });
  }

  if (req.method === "DELETE") {
    clearSessionCookie(res);
    return res.status(200).json({ ok: true });
  }

  if (req.method === "POST") {
    const { password } = req.body || {};
    if (!process.env.ADMIN_PASSWORD) {
      return res.status(500).json({ error: "ADMIN_PASSWORD belum diset di server" });
    }
    if (!password || password !== process.env.ADMIN_PASSWORD) {
      return res.status(401).json({ error: "Password salah" });
    }
    setSessionCookie(res);
    return res.status(200).json({ ok: true });
  }

  res.setHeader("Allow", "GET, POST, DELETE");
  return res.status(405).json({ error: "Method tidak diizinkan" });
};
