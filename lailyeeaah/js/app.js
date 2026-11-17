// Lailyeeaah — logika frontend (Alpine.js)
// Countdown dihitung dari tanggal_berakhir setiap detik, bukan angka yang disimpan,
// jadi tetap akurat walau web lama ditutup.

const WIB = "Asia/Jakarta";

function fmtWIB(iso, withTime = true) {
  if (!iso) return "-";
  const opt = { timeZone: WIB, day: "2-digit", month: "short", year: "numeric" };
  if (withTime) Object.assign(opt, { hour: "2-digit", minute: "2-digit", hour12: false });
  return new Intl.DateTimeFormat("id-ID", opt).format(new Date(iso));
}

function fmtRupiah(n) {
  return "Rp" + new Intl.NumberFormat("id-ID").format(n || 0);
}

const TIPE_AKUN_LABEL = {
  pro_sharing: "Pro Sharing",
  pro_privat: "Pro Privat",
  max_sharing: "Max Sharing",
  max_privat: "Max Privat",
};

function formatTipeAkun(val) {
  return TIPE_AKUN_LABEL[val] || val || "-";
}

function isLoginPage() {
  const p = (location.pathname || "").toLowerCase();
  return p.includes("login");
}

async function api(url, opt = {}) {
  const res = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    ...opt,
  });
  if (res.status === 401 && !isLoginPage()) {
    location.href = "/login.html";
    throw new Error("Belum login");
  }

  const text = await res.text().catch(() => "");
  let json = {};
  try {
    json = JSON.parse(text);
  } catch {}

  if (!res.ok) {
    console.error(`[API Error] ${opt.method || "GET"} ${url} (${res.status}):`, text);
    const detail =
      json.error ||
      json.message ||
      (text && text.length < 250 && !text.includes("<!DOCTYPE") && !text.includes("<html") ? text : null) ||
      `Server mengembalikan HTTP ${res.status} (${res.statusText || "Error"})`;
    throw new Error(detail);
  }
  return json;
}

function getPaketSatuan(p) {
  if (!p) return "";
  const nama = (p.nama_paket || "").toLowerCase();
  if (nama.includes("hari")) return "hari";
  if (nama.includes("minggu")) return "minggu";
  if (nama.includes("bulan")) return "bulan";
  if (nama.includes("tahun")) return "tahun";
  return "lainnya";
}

// Nilai default input datetime-local = sekarang (waktu lokal browser)
function nowLocalInput() {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

function urlBase64ToUint8Array(base64String) {
  const cleanStr = String(base64String || "").trim().replace(/['"\s]/g, "");
  const padding = "=".repeat((4 - (cleanStr.length % 4)) % 4);
  const base64 = (cleanStr + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

// Global store untuk badge pesan belum dibaca di navigasi semua halaman
document.addEventListener("alpine:init", () => {
  Alpine.store("chatBadge", {
    unread: 0,
    async update() {
      if (isLoginPage()) return;
      try {
        const res = await api("/api/chat");
        this.unread = res.unreadCount || 0;
      } catch {}
    },
    init() {
      this.update();
      setInterval(() => {
        if (document.visibilityState === "visible") {
          this.update();
        }
      }, 15000);
    },
  });
});

document.addEventListener("DOMContentLoaded", () => {
  if (typeof lucide !== "undefined" && lucide.createIcons) {
    lucide.createIcons();
  }

  // Registrasi service worker di background untuk halaman non-login
  if ("serviceWorker" in navigator && !isLoginPage()) {
    navigator.serviceWorker.register("/sw.js").catch((err) => {
      console.warn("[SW] Gagal mendaftar sw.js:", err);
    });
  }
});

// ====================== PUSH NOTIFICATION MANAGER ======================
function pushNotificationManager() {
  return {
    supported: false,
    permission: "default", // default | granted | denied
    isSubscribed: false,
    loading: false,
    isIos: false,
    isStandalone: false,

    async init() {
      const ua = window.navigator.userAgent.toLowerCase();
      this.isIos = /iphone|ipad|ipod/.test(ua);
      this.isStandalone = window.navigator.standalone === true || window.matchMedia("(display-mode: standalone)").matches;

      if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
        this.supported = false;
        return;
      }
      this.supported = true;
      this.permission = Notification.permission;

      try {
        const reg = await navigator.serviceWorker.register("/sw.js");
        const sub = await reg.pushManager.getSubscription();
        this.isSubscribed = !!sub;
      } catch (err) {
        console.warn("[push] Registrasi sw atau cek subscription gagal:", err);
      }
    },

    get statusDeskripsi() {
      if (!this.supported) return "Browser ini tidak mendukung Web Push Notification.";
      if (this.isSubscribed) return "Notifikasi Web Push aktif di perangkat ini.";
      if (this.permission === "denied") return "Izin notifikasi ditolak di browser. Aktifkan di pengaturan browser.";
      if (this.isIos && !this.isStandalone) return "Di iPhone, buka Share > Add to Home Screen agar bisa menerima notifikasi.";
      return "Aktifkan notifikasi untuk menerima peringatan saat sewa hampir habis / habis.";
    },

    async aktifkan() {
      if (!this.supported) {
        alert("Browser ini tidak mendukung Web Push Notification.");
        return;
      }
      if (this.isIos && !this.isStandalone) {
        alert("Khusus iPhone / iPad (iOS 16.4+):\n1. Tekan tombol Share di Safari\n2. Pilih 'Add to Home Screen' (Tambahkan ke Layar Utama)\n3. Buka Lailyeeaah dari Layar Utama, lalu klik 'Aktifkan Notifikasi' kembali.");
        return;
      }

      this.loading = true;
      try {
        // 1. Ambil VAPID public key dari server
        let resKey;
        try {
          resKey = await api("/api/push-subscribe");
        } catch (e) {
          throw new Error("Gagal mengambil kunci VAPID: " + e.message);
        }

        const vapidPublicKey = resKey && resKey.vapidPublicKey;
        if (!vapidPublicKey) {
          throw new Error("VAPID_PUBLIC_KEY belum diset di Vercel Environment Variables. Silakan generate VAPID keys dan tambahkan ke Vercel.");
        }

        // 2. Minta izin ke pengguna (wajib dari interaksi klik tombol)
        let perm = Notification.permission;
        if (perm !== "granted") {
          perm = await Notification.requestPermission();
        }
        this.permission = perm;
        if (perm !== "granted") {
          throw new Error("Izin notifikasi tidak diberikan (status: " + perm + "). Harap izinkan notifikasi pada ikon setelan browser di samping alamat URL.");
        }

        // 3. Pastikan Service Worker terdaftar & aktif
        let reg;
        try {
          reg = await navigator.serviceWorker.register("/sw.js");
          await navigator.serviceWorker.ready;
        } catch (swErr) {
          throw new Error("Service Worker gagal didaftarkan: " + swErr.message);
        }

        // 4. Daftarkan Push Subscription ke browser push service (Google FCM / Mozilla autopush)
        let sub = await reg.pushManager.getSubscription();
        if (!sub) {
          try {
            const cleanKey = String(vapidPublicKey).replace(/['"\s]/g, "");
            sub = await reg.pushManager.subscribe({
              userVisibleOnly: true,
              applicationServerKey: urlBase64ToUint8Array(cleanKey),
            });
          } catch (subErr) {
            throw new Error("Gagal mendaftarkan push ke browser: " + subErr.message);
          }
        }

        // 5. Simpan subscription ke Supabase via serverless function
        try {
          await api("/api/push-subscribe", {
            method: "POST",
            body: JSON.stringify({
              subscription: sub.toJSON(),
              userAgent: navigator.userAgent,
            }),
          });
        } catch (saveErr) {
          throw new Error("Gagal menyimpan subscription ke server: " + saveErr.message);
        }

        this.isSubscribed = true;
        alert("Notifikasi Web Push berhasil diaktifkan! Browser ini akan menerima pemberitahuan sewa.");
      } catch (err) {
        console.error("[push] aktifkan error:", err);
        alert("Gagal mengaktifkan notifikasi:\n" + err.message);
      } finally {
        this.loading = false;
        if (typeof lucide !== "undefined" && lucide.createIcons) {
          setTimeout(() => lucide.createIcons(), 50);
        }
      }
    },
  };
}

// ====================== HALAMAN MONITORING ======================
function monitoringPage() {
  return {
    rentals: [],
    packages: [],
    loading: true,
    now: Date.now(),
    search: "",
    filter: "semua", // semua | aktif | hampir | habis
    showForm: false,
    saving: false,
    editId: null,
    form: kosong(),
    toast: "",
    confirmDone: null, // rental yang sedang dikonfirmasi Done
    confirmHapus: null,
    push: pushNotificationManager(),

    async init() {
      // "Sewa lagi" dari halaman Riwayat
      const ulang = localStorage.getItem("laily_sewa_lagi");
      await Promise.all([this.muatRentals(), this.muatPackages(), this.push.init()]);
      this.loading = false;
      setInterval(() => (this.now = Date.now()), 1000);
      if (ulang) {
        localStorage.removeItem("laily_sewa_lagi");
        const d = JSON.parse(ulang);
        this.bukaForm();
        this.form.nama = d.nama || "";
        this.form.no_wa = d.no_wa || "";
        this.form.email_pelanggan = d.email_pelanggan || "";
        this.form.device = d.device || "";
        if (d.tipe_akun) this.form.tipe_akun = d.tipe_akun;
        if (d.email_akun) this.form.email_akun = d.email_akun;
        this.onTipeAkunChange();
      }
      this.$watch("showForm", () => setTimeout(() => lucide.createIcons(), 50));
    },

    async muatRentals() {
      const { data } = await api("/api/rentals?status=aktif");
      this.rentals = data || [];
      setTimeout(() => lucide.createIcons(), 50);
    },
    async muatPackages() {
      const { data } = await api("/api/packages");
      this.packages = data || [];
    },

    // ---------- status & countdown ----------
    sisaMs(r) {
      return new Date(r.tanggal_berakhir).getTime() - this.now;
    },
    statusKartu(r) {
      const ms = this.sisaMs(r);
      if (ms <= 0) return "habis";
      if (ms < 24 * 60 * 60 * 1000) return "hampir";
      return "aktif";
    },
    countdown(r) {
      let ms = this.sisaMs(r);
      if (ms <= 0) return "HABIS";
      const dtk = Math.floor(ms / 1000);
      const hari = Math.floor(dtk / 86400);
      const jam = Math.floor((dtk % 86400) / 3600);
      const menit = Math.floor((dtk % 3600) / 60);
      const detik = dtk % 60;
      const p = (n) => String(n).padStart(2, "0");
      return hari > 0
        ? `${hari} hari ${p(jam)} jam ${p(menit)} menit`
        : `${p(jam)} jam ${p(menit)} menit ${p(detik)} detik`;
    },
    progres(r) {
      const mulai = new Date(r.tanggal_sewa).getTime();
      const akhir = new Date(r.tanggal_berakhir).getTime();
      if (akhir <= mulai) return 100;
      const pct = ((this.now - mulai) / (akhir - mulai)) * 100;
      return Math.min(100, Math.max(0, pct));
    },

    // ---------- ringkasan & daftar ----------
    get ringkasan() {
      const s = { aktif: 0, hampir: 0, habis: 0 };
      this.rentals.forEach((r) => s[this.statusKartu(r)]++);
      return s;
    },
    get daftar() {
      return this.rentals
        .filter((r) => {
          const s = this.search.toLowerCase();
          const cocokNama = r.nama.toLowerCase().includes(s) ||
            (r.email_akun && r.email_akun.toLowerCase().includes(s)) ||
            (r.email_pelanggan && r.email_pelanggan.toLowerCase().includes(s));
          const st = this.statusKartu(r);
          const cocokFilter = this.filter === "semua" || st === this.filter;
          return cocokNama && cocokFilter;
        })
        .sort((a, b) => new Date(a.tanggal_berakhir) - new Date(b.tanggal_berakhir));
    },

    // ---------- hitung harga & filter paket berdasarkan satuan & tipe akun ----------
    getPaketSatuan,
    formatTipeAkun,
    get filteredPackages() {
      if (!this.form.tipe_akun) return [];
      return this.packages.filter((p) => {
        const cocokTipe = p.tipe_akun === this.form.tipe_akun;
        const nama = (p.nama_paket || "").toLowerCase();
        const satuan = this.form.durasi_satuan;
        const cocokSatuan =
          satuan === "hari"   ? nama.includes("hari")   :
          satuan === "minggu" ? nama.includes("minggu") :
          satuan === "bulan"  ? nama.includes("bulan")  : true;
        return cocokTipe && cocokSatuan;
      });
    },
    onTipeAkunChange() {
      this.form.paket_harga_id = "";
      if (this.form.tipe_akun === "pro_privat" || this.form.tipe_akun === "max_privat") {
        this.form.durasi_satuan = "bulan";
      } else {
        this.form.durasi_satuan = "hari";
      }
      const paket = this.filteredPackages;
      if (paket.length > 0) {
        this.form.paket_harga_id = paket[0].id;
        this.form.durasi_nilai = 1;
      }
    },
    onSatuanChange() {
      this.form.paket_harga_id = "";
      const paket = this.filteredPackages;
      if (paket.length > 0) {
        this.form.paket_harga_id = paket[0].id;
        this.form.durasi_nilai = 1;
      }
    },
    onPaketChange() {
      const p = this.packages.find((x) => x.id === this.form.paket_harga_id);
      if (p) this.sesuaikanDurasiDariPaket(p);
    },
    sesuaikanDurasiDariPaket(p) {
      if (!p) return;
      const nama = (p.nama_paket || "").toLowerCase();
      const match = nama.match(/(\d+)\s*(hari|minggu|bulan|tahun)/i);
      if (match) {
        const val = parseInt(match[1], 10);
        if (val >= 1) this.form.durasi_nilai = val;
      } else {
        this.form.durasi_nilai = 1;
      }
    },
    hitungTotalHarga() {
      const p = this.packages.find((x) => x.id === this.form.paket_harga_id);
      if (!p) return 0;
      const n = parseInt(this.form.durasi_nilai, 10) || 1;
      const satuan = this.form.durasi_satuan;
      const nama = (p.nama_paket || "").toLowerCase();
      const baseHarga = parseInt(p.harga, 10) || 0;

      if (satuan === "hari" && nama.includes("hari")) {
        return baseHarga * n;
      }
      if (satuan === "minggu" && nama.includes("minggu") && !nama.match(/[2-9]\d*\s*minggu/)) {
        return baseHarga * n;
      }
      if (satuan === "bulan" && (nama.includes("1 bulan") || (nama.includes("bulan") && !nama.match(/[2-9]\d*\s*bulan/)))) {
        return baseHarga * n;
      }
      return baseHarga;
    },

    // ---------- form tambah / edit ----------
    bukaForm(r = null) {
      if (r) {
        this.editId = r.id;
        const t = new Date(r.tanggal_sewa);
        t.setMinutes(t.getMinutes() - t.getTimezoneOffset());
        this.form = {
          nama: r.nama,
          no_wa: r.no_wa || "",
          email_pelanggan: r.email_pelanggan || "",
          device: r.device,
          tipe_akun: r.tipe_akun || "pro_sharing",
          email_akun: r.email_akun || "",
          tanggal_sewa: t.toISOString().slice(0, 16),
          durasi_nilai: r.durasi_nilai,
          durasi_satuan: r.durasi_satuan,
          paket_harga_id: r.paket_harga_id,
        };
      } else {
        this.editId = null;
        this.form = kosong();
        this.onTipeAkunChange();
      }
      this.showForm = true;
    },
    async simpan() {
      this.saving = true;
      try {
        const body = JSON.stringify({
          ...this.form,
          harga: this.hitungTotalHarga(),
          tanggal_sewa: new Date(this.form.tanggal_sewa).toISOString(),
        });
        if (this.editId) {
          await api(`/api/rentals?id=${this.editId}`, { method: "PUT", body });
          this.tampilToast("Perubahan disimpan ✓");
        } else {
          await api("/api/rentals", { method: "POST", body });
          this.tampilToast("Berhasil disimpan ✓");
        }
        this.showForm = false;
        await this.muatRentals();
      } catch (e) {
        alert(e.message);
      } finally {
        this.saving = false;
      }
    },

    // ---------- Done & hapus ----------
    async lakukanDone() {
      const r = this.confirmDone;
      this.confirmDone = null;
      try {
        await api(`/api/rentals?id=${r.id}`, {
          method: "PUT",
          body: JSON.stringify({ action: "done" }),
        });
        this.tampilToast(`Sewa ${r.nama} dipindah ke Riwayat ✓`);
        await this.muatRentals();
      } catch (e) {
        alert(e.message);
      }
    },
    async lakukanHapus() {
      const r = this.confirmHapus;
      this.confirmHapus = null;
      try {
        await api(`/api/rentals?id=${r.id}`, { method: "DELETE" });
        this.tampilToast("Kartu dihapus");
        await this.muatRentals();
      } catch (e) {
        alert(e.message);
      }
    },

    tampilToast(msg) {
      this.toast = msg;
      setTimeout(() => (this.toast = ""), 2500);
    },
    fmtWIB,
    fmtRupiah,
    logout,
  };

  function kosong() {
    return {
      nama: "",
      no_wa: "",
      email_pelanggan: "",
      device: "",
      tipe_akun: "pro_sharing",
      email_akun: "",
      tanggal_sewa: nowLocalInput(),
      durasi_nilai: 1,
      durasi_satuan: "hari",
      paket_harga_id: "",
    };
  }
}

// ====================== HALAMAN RIWAYAT ======================
function riwayatPage() {
  return {
    rows: [],
    loading: true,
    search: "",
    bulan: "", // format YYYY-MM dari <input type="month">

    async init() {
      const { data } = await api("/api/rentals?status=selesai");
      this.rows = data || [];
      this.loading = false;
      setTimeout(() => lucide.createIcons(), 50);
    },

    get daftar() {
      return this.rows.filter((r) => {
        const cocokNama = r.nama.toLowerCase().includes(this.search.toLowerCase()) ||
          (r.email_akun && r.email_akun.toLowerCase().includes(this.search.toLowerCase()));
        let cocokBulan = true;
        if (this.bulan) {
          const d = new Intl.DateTimeFormat("sv-SE", {
            timeZone: WIB,
            year: "numeric",
            month: "2-digit",
          }).format(new Date(r.selesai_pada || r.tanggal_berakhir));
          cocokBulan = d === this.bulan;
        }
        return cocokNama && cocokBulan;
      });
    },
    get totalPendapatan() {
      return this.daftar.reduce((s, r) => s + (r.harga || 0), 0);
    },
    statusNotif(r) {
      if (r.notif_terkirim) return { label: "Terkirim", cls: "bg-sage-200 text-sage-700" };
      if ((r.notif_percobaan || 0) > 0 || r.notif_error) return { label: "Gagal", cls: "bg-blush-200 text-blush-700" };
      return { label: "—", cls: "bg-blush-100 text-ink/50" };
    },
    sewaLagi(r) {
      localStorage.setItem(
        "laily_sewa_lagi",
        JSON.stringify({
          nama: r.nama,
          no_wa: r.no_wa,
          email_pelanggan: r.email_pelanggan,
          device: r.device,
          tipe_akun: r.tipe_akun,
          email_akun: r.email_akun,
        })
      );
      location.href = "/index.html";
    },
    formatTipeAkun,
    fmtWIB,
    fmtRupiah,
    logout,
  };
}

// ====================== HALAMAN PAKET HARGA ======================
function paketPage() {
  return {
    packages: [],
    loading: true,
    errMsg: "",
    showForm: false,
    saving: false,
    saveErr: "",
    editId: null,
    confirmHapus: null,
    form: { nama_paket: "", harga: "", tipe_akun: "pro_sharing" },

    tipeList: [
      { value: "pro_sharing", label: "Pro Sharing" },
      { value: "pro_privat",  label: "Pro Privat"  },
      { value: "max_sharing", label: "Max Sharing" },
      { value: "max_privat",  label: "Max Privat"  },
    ],

    async init() {
      await this.muat();
      lucide.createIcons();
    },

    async muat() {
      this.loading = true;
      this.errMsg = "";
      try {
        const { data } = await api("/api/packages?all=1");
        this.packages = (data || []).filter((p) => p.aktif);
      } catch (e) {
        this.errMsg = e.message || "Gagal memuat paket";
      } finally {
        this.loading = false;
      }
    },

    paketByTipe(tipe) {
      return this.packages.filter((p) => p.tipe_akun === tipe);
    },

    bukaFormTambah() {
      this.editId = null;
      this.form = { nama_paket: "", harga: "", tipe_akun: "pro_sharing" };
      this.saveErr = "";
      this.showForm = true;
    },

    bukaFormEdit(p) {
      this.editId = p.id;
      this.form = { nama_paket: p.nama_paket, harga: p.harga, tipe_akun: p.tipe_akun || "pro_sharing" };
      this.saveErr = "";
      this.showForm = true;
    },

    async simpan() {
      this.saving = true;
      this.saveErr = "";
      try {
        const body = {
          nama_paket: String(this.form.nama_paket).trim(),
          harga: parseInt(this.form.harga, 10),
          tipe_akun: this.form.tipe_akun,
        };
        if (this.editId) {
          await api(`/api/packages?id=${this.editId}`, {
            method: "PUT",
            body: JSON.stringify(body),
          });
        } else {
          await api("/api/packages", {
            method: "POST",
            body: JSON.stringify(body),
          });
        }
        this.showForm = false;
        await this.muat();
      } catch (e) {
        this.saveErr = e.message || "Gagal menyimpan";
      } finally {
        this.saving = false;
      }
    },

    hapusPaket(p) {
      this.confirmHapus = p;
    },

    async konfirmasiHapus() {
      if (!this.confirmHapus) return;
      try {
        await api(`/api/packages?id=${this.confirmHapus.id}`, { method: "DELETE" });
        this.confirmHapus = null;
        await this.muat();
      } catch (e) {
        alert("Gagal menghapus: " + e.message);
      }
    },

    fmtRupiah,
    logout,
  };
}

// ====================== HALAMAN CHAT BOT ======================
function chatPage() {
  return {
    messages: [],
    loading: true,
    text: "",
    sending: false,
    toast: "",
    pollTimer: null,
    push: pushNotificationManager(),

    async init() {
      await Promise.all([this.muat(false), this.push.init()]);
      this.loading = false;

      // Tandai pesan sudah dibaca saat membuka chat
      await this.tandaiDibaca();

      // Polling setiap 10 detik saat tab aktif
      this.setupPolling();

      // Tangani anchor hash scroll (#msg-<id>)
      this.cekHashScroll();
      window.addEventListener("hashchange", () => this.cekHashScroll());

      if (typeof lucide !== "undefined" && lucide.createIcons) {
        setTimeout(() => lucide.createIcons(), 50);
      }
    },

    setupPolling() {
      this.pollTimer = setInterval(async () => {
        if (document.visibilityState === "visible") {
          await this.muat(true);
        }
      }, 10000);
    },

    async muat(delta = false) {
      try {
        let url = "/api/chat";
        if (delta && this.messages.length > 0) {
          const lastMsg = this.messages[this.messages.length - 1];
          if (lastMsg && lastMsg.created_at) {
            url += `?after=${encodeURIComponent(lastMsg.created_at)}`;
          }
        }

        const res = await api(url);
        if (delta) {
          if (res.data && res.data.length > 0) {
            const ids = new Set(this.messages.map((m) => m.id));
            const baru = res.data.filter((m) => !ids.has(m.id));
            if (baru.length > 0) {
              this.messages.push(...baru);
              this.scrollToBottom();
              await this.tandaiDibaca();
            }
          }
        } else {
          this.messages = res.data || [];
          this.scrollToBottom();
        }

        if (Alpine.store("chatBadge")) {
          Alpine.store("chatBadge").unread = 0;
        }

        if (typeof lucide !== "undefined" && lucide.createIcons) {
          setTimeout(() => lucide.createIcons(), 50);
        }
      } catch (err) {
        console.error("[chat] Gagal memuat pesan:", err);
      }
    },

    async kirim() {
      const isi = this.text.trim();
      if (!isi) return;

      this.sending = true;
      try {
        const { data } = await api("/api/chat", {
          method: "POST",
          body: JSON.stringify({ isi }),
        });
        if (data) {
          this.messages.push(data);
          this.text = "";
          this.scrollToBottom();
          if (typeof lucide !== "undefined" && lucide.createIcons) {
            setTimeout(() => lucide.createIcons(), 50);
          }
        }
      } catch (err) {
        alert("Gagal mengirim pesan: " + err.message);
      } finally {
        this.sending = false;
      }
    },

    async tandaiDibaca() {
      try {
        await api("/api/chat?action=read", { method: "PUT" });
        if (Alpine.store("chatBadge")) {
          Alpine.store("chatBadge").unread = 0;
        }
      } catch {}
    },

    async tandaiSelesai(rentalId, msg) {
      if (!rentalId) return;
      try {
        await api(`/api/rentals?id=${rentalId}`, {
          method: "PUT",
          body: JSON.stringify({ action: "done" }),
        });
        msg._selesai = true;
        this.tampilToast("Sewa berhasil ditandai selesai ✓");
        if (typeof lucide !== "undefined" && lucide.createIcons) {
          setTimeout(() => lucide.createIcons(), 50);
        }
      } catch (err) {
        alert("Gagal menandai selesai: " + err.message);
      }
    },

    cekHashScroll() {
      const hash = window.location.hash;
      if (hash && hash.startsWith("#msg-")) {
        setTimeout(() => {
          const el = document.querySelector(hash);
          if (el) {
            el.scrollIntoView({ behavior: "smooth", block: "center" });
            el.classList.add("msg-highlight");
            setTimeout(() => el.classList.remove("msg-highlight"), 3000);
          }
        }, 300);
      }
    },

    scrollToBottom() {
      setTimeout(() => {
        const c = document.getElementById("chat-messages-container");
        if (c) c.scrollTop = c.scrollHeight;
      }, 50);
    },

    tampilToast(msg) {
      this.toast = msg;
      setTimeout(() => (this.toast = ""), 2500);
    },

    fmtWIB,
    logout,
  };
}

// ====================== HALAMAN LOGIN ======================
function loginPage() {
  return {
    password: "",
    error: "",
    loading: false,
    async init() {
      try {
        const res = await fetch("/api/login", { credentials: "same-origin" });
        const data = await res.json().catch(() => ({}));
        if (data.loggedIn) {
          location.href = "/index.html";
        }
      } catch {}
    },
    async masuk() {
      this.loading = true;
      this.error = "";
      try {
        await api("/api/login", {
          method: "POST",
          body: JSON.stringify({ password: this.password }),
        });
        location.href = "/index.html";
      } catch (e) {
        this.error = e.message;
      } finally {
        this.loading = false;
      }
    },
  };
}

async function logout() {
  await api("/api/login", { method: "DELETE" });
  location.href = "/login.html";
}
