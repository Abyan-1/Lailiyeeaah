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

async function api(url, opt = {}) {
  const res = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    ...opt,
  });
  if (res.status === 401 && !location.pathname.endsWith("login.html")) {
    location.href = "/login.html";
    throw new Error("Belum login");
  }
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || "Terjadi kesalahan");
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

document.addEventListener("DOMContentLoaded", () => {
  if (typeof lucide !== "undefined" && lucide.createIcons) {
    lucide.createIcons();
  }
});

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

    async init() {
      // "Sewa lagi" dari halaman Riwayat
      const ulang = localStorage.getItem("laily_sewa_lagi");
      await Promise.all([this.muatRentals(), this.muatPackages()]);
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
        // Filter berdasarkan tipe akun
        const cocokTipe = p.tipe_akun === this.form.tipe_akun;
        // Filter berdasarkan satuan yang dipilih user
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
      // Reset paket saat tipe akun berubah
      this.form.paket_harga_id = "";
      // Auto-pilih satuan default: privat → bulan, sharing → hari
      if (this.form.tipe_akun === "pro_privat" || this.form.tipe_akun === "max_privat") {
        this.form.durasi_satuan = "bulan";
      } else {
        this.form.durasi_satuan = "hari";
      }
      // Auto-pilih paket pertama yang cocok
      const paket = this.filteredPackages;
      if (paket.length > 0) {
        this.form.paket_harga_id = paket[0].id;
        this.form.durasi_nilai = 1;
      }
    },
    onSatuanChange() {
      // Reset paket saat satuan berubah, pilih paket pertama yang cocok
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
      // Durasi nilai otomatis dari nama paket (satuan sudah dipilih user)
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
          }).format(new Date(r.selesai_pada || r.tanggal_berakhir)); // "YYYY-MM"
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
  };
}

// ====================== HALAMAN LOGIN ======================
function loginPage() {
  return {
    password: "",
    error: "",
    loading: false,
    async init() {
      // Jika sudah login, langsung ke Monitoring
      try {
        const { loggedIn } = await api("/api/login");
        if (loggedIn) location.href = "/index.html";
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
