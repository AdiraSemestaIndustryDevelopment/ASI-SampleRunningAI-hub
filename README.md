# Adira Semesta Industry — App Hub

Panduan ini ditulis untuk yang **awam coding**. Ikuti urutan dari atas ke bawah.

---

## 1. Struktur Folder

```
project-root/
├── index.html                     <- HUB utama (portal semua app)
├── shared/
│   ├── firebase-config.js         <- konfigurasi Firebase (SEKALI setup, dipakai semua app)
│   ├── auth.js                    <- logic login Google + cek whitelist
│   └── styles.css                 <- tema visual (hitam + hijau neon)
└── apps/
    └── sample-wip-agent/
        └── index.html              <- App pertama: Sample WIP Running Agent

Setiap app baru nanti = 1 folder baru di dalam apps/, lalu tambahkan
kartunya di array APPS di index.html hub.
```

Kenapa strukturnya begini: satu `firebase-config.js` dan satu `auth.js` dipakai
bersama oleh semua app, jadi Bapak tidak perlu setup Firebase berkali-kali,
dan kalau ada bug di login, cukup diperbaiki di satu tempat.

---

## 2. Setup Firebase (Google Login + Firestore) — 15 menit

1. Buka **console.firebase.google.com** → **Add project** → beri nama misal `adira-semesta-hub`.
2. Di dalam project → klik ikon **`</>`** (Web app) → daftarkan app → Firebase akan kasih
   object `firebaseConfig` (apiKey, authDomain, dst). **Copy semua ini.**
3. Buka file `shared/firebase-config.js` di project Bapak → paste/ganti isi object
   `firebaseConfig` dengan punya Bapak.
4. Di menu kiri Firebase Console → **Build > Authentication** → tab **Sign-in method**
   → aktifkan **Google**.
5. Masih di Authentication → tab **Settings > Authorized domains** → nanti setelah
   GitHub Pages aktif (langkah 4 di bawah), tambahkan domain GitHub Pages Bapak
   (contoh: `namauser.github.io`) dan domain sendiri kalau sudah pakai custom domain.
6. Di menu kiri → **Build > Firestore Database** → **Create database** → pilih mode
   **production** → pilih lokasi server (asia-southeast1 paling dekat dari Indonesia).
7. Buat collection bernama **`users`**. Untuk setiap orang yang boleh login, buat
   1 document dengan:
   - **Document ID** = email Google mereka persis (contoh: `juan@gmail.com`)
   - Field:
     ```
     name: "Juan"
     role: "admin"          // atau "viewer"
     allowedApps: ["sample-wip-agent"]   // opsional, kalau mau batasi app tertentu
     ```
   Ini adalah sistem whitelist-nya: **kalau email tidak ada document di sini,
   otomatis ditolak login** meskipun mereka pakai akun Google valid.

   Berdasarkan daftar yang Bapak kasih, saya sarankan role awal begini:

   | Nama    | Role   |
   |---------|--------|
   | Juan    | admin  |
   | Arlita  | admin  |
   | Vanny   | viewer* |
   | Wiji    | viewer* |
   | 6 staff lain + 35 operator | viewer |

   *Vanny & Wiji Bapak sebut sebagai "PIC Follow Up" — kalau mereka perlu **mengubah**
   data (bukan cuma lihat), kasih role `admin` juga. Kalau cuma perlu lihat + terima
   notifikasi follow-up, `viewer` sudah cukup. Ini keputusan Bapak, saya bisa
   sesuaikan Firestore rules-nya begitu Bapak konfirmasi.

8. Firestore Security Rules (di tab **Rules**) — pasang ini supaya hanya user
   yang login yang bisa baca/tulis:
   ```
   rules_version = '2';
   service cloud.firestore {
     match /databases/{database}/documents {
       match /users/{email} {
         allow read: if request.auth != null && request.auth.token.email == email;
         allow write: if false; // hanya Bapak yang edit manual lewat Console
       }
       match /wip_data/{docId} {
         allow read: if request.auth != null;
         allow write: if request.auth != null &&
           get(/databases/$(database)/documents/users/$(request.auth.token.email)).data.role == "admin";
       }
     }
   }
   ```

---

## 3. Aktifkan GitHub Pages

1. Buat repository baru di GitHub (bisa **private**, GitHub Pages tetap bisa jalan
   di repo private kalau Bapak pakai GitHub Pro, atau **public** kalau pakai free plan
   — karena ini data internal perusahaan, pertimbangkan repo private + GitHub Pro,
   atau public tapi tanpa data sensitif ter-hardcode di kode).
2. Upload semua file di folder project ini ke repo tersebut (lewat GitHub Desktop,
   web upload, atau `git push` kalau nanti sudah terbiasa).
3. Di repo → **Settings > Pages** → **Source**: pilih branch `main`, folder `/ (root)`.
4. Tunggu 1-2 menit → GitHub kasih URL seperti `https://namauser.github.io/nama-repo/`.
5. **Jangan lupa balik ke Firebase Authentication > Authorized domains** dan
   tambahkan domain ini (langkah 2.5 di atas).

---

## 4. Arahkan Domain Sendiri

1. Di registrar domain Bapak (Niagahoster, Rumahweb, GoDaddy, dll), tambahkan:
   - Record **CNAME** dari `www` (atau subdomain pilihan Bapak) → `namauser.github.io`
   - Kalau mau pakai root domain (`adirasemesta.com` tanpa www), tambahkan 4
     record **A** yang mengarah ke IP GitHub Pages:
     ```
     185.199.108.153
     185.199.109.153
     185.199.110.153
     185.199.111.153
     ```
2. Di GitHub repo → **Settings > Pages > Custom domain** → masukkan domain Bapak
   → centang **Enforce HTTPS** (tunggu beberapa menit sampai sertifikat aktif).
3. Tambahkan domain baru ini juga ke **Firebase Authorized domains**.

---

## 5. Arsitektur Data — Google Sheet → Sistem (PENTING, baca sebelum Fase 2)

Sheet "2026 OUTSTANDING SAMPLE STATUS" isinya sangat lengkap (kolom Customer,
Style, Target Selesai, Status, Due Date, reject rate, dsb). Ada 2 cara
menyambungkannya ke web app, saya rekomendasikan opsi **B**:

**Opsi A — Baca langsung dari Google Sheets API di browser**
- Simpel, tapi butuh API key/OAuth yang riskan kalau taruh di kode client-side,
  dan tidak benar-benar "real-time" (perlu polling tiap X detik).

**Opsi B (Rekomendasi) — Google Apps Script sebagai jembatan**
- Bapak pasang **Apps Script** langsung di dalam Google Sheet tersebut.
- Script punya trigger `onEdit` → setiap kali Sample Room mengubah data,
  otomatis kirim baris yang berubah ke **Firestore** (lewat Firestore REST API).
- Web app (hub kita) baca dari Firestore pakai `onSnapshot` → **update real-time
  sungguhan** tanpa jeda, tanpa polling, dan tanpa expose API key Google Sheets
  di browser.
- Ini juga sekalian jadi tempat AI Agent "membaca" data untuk dianalisa (poin 7).

Saya bisa buatkan script Apps Script ini di Fase 2, begitu Firebase sudah live.

---

## 6. Kenapa strukturnya begini (poin 6 di request Bapak)

- **Hub + multi-app terpisah**: supaya tiap app independen (kalau 1 app error,
  app lain tetap jalan), tapi tetap 1 pintu login.
- **Shared auth/config**: 1 sumber kebenaran untuk siapa boleh akses apa.
- **Firestore sebagai "otak data"**: Google Sheet tetap jadi tempat kerja Sample
  Room (mereka sudah terbiasa), tapi semua app, AI agent, dan dashboard baca dari
  Firestore yang real-time dan lebih aman diatur hak aksesnya per role.

---

## 7. Fase 2 — AI Agent (Priority + Follow-up + Prediction)

Sudah dibangun di fase ini, ada di folder `shared/`:

- **`priority-engine.js`** — hitung skor urgency tiap SMI berdasarkan due date,
  kekurangan material, status trial vs comment buyer. **Transparan**: setiap
  skor disertai daftar alasan (`reasons`), supaya keputusan AI ini bisa
  Bapak/staff audit, bukan black-box.
- **`followup-engine.js`** — deteksi otomatis 4 kondisi "seharusnya sudah ada
  tapi belum": techpack belum diterima, comment buyer ditunggu, material
  belum selesai, sample belum dikirim padahal sudah lewat due date. Setiap
  temuan otomatis ditugaskan ke Vanny/Wiji (PIC follow-up) dan dicatat di
  Firestore collection `followups`.
- **`prediction-engine.js`** — 3 jenis early-warning: (1) overload kapasitas
  cutting/sewing dibanding jumlah SMI aktif, (2) kendala yang berulang ≥3x
  (sinyal masalah sistemik), (3) tren reject rate yang jauh di atas rata-rata.
  **Catatan jujur**: ini rule-based heuristik, bukan machine learning
  sesungguhnya — cukup kuat untuk early warning, tapi akurasinya akan makin
  baik kalau nanti di-upgrade pakai data historis 12+ bulan.
- **`apps/sample-wip-agent/index.html`** — dashboard real-time yang
  menggabungkan ketiganya: KPI cards, tabel WIP terurut urgency, panel
  follow-up, dan panel prediksi. Semua update otomatis (Firestore
  `onSnapshot`) begitu Apps Script sync jalan.
- **`apps-script/Code.gs`** — jembatan Google Sheet → Firestore real-time
  (lihat bagian 5 di atas untuk cara pasang).

### Yang perlu Bapak lakukan supaya Fase 2 ini hidup:
1. Selesaikan setup Firebase (bagian 2) dan GitHub Pages (bagian 3).
2. Pasang `apps-script/Code.gs` di Google Sheet WIP (ikuti komentar di baris
   paling atas file itu) — ini yang mengisi Firestore collection `wip_data`.
3. Buka dashboard `apps/sample-wip-agent/index.html` → begitu Apps Script
   jalan, tabel & KPI akan otomatis terisi.
4. **Koreksi angka di `prediction-engine.js`** (`AVG_THROUGHPUT_PER_OPERATOR_PER_WEEK`)
   — itu masih estimasi saya, ganti dengan angka riil dari pengalaman lapangan
   Bapak supaya prediksi kapasitasnya akurat.
5. Kalau nama kolom di sheet Bapak berbeda dari yang saya asumsikan (misal
   "Due Date" vs "DUE DATE"), kabari saya — saya sesuaikan `normalizeKey()`
   di Apps Script dan field mapping di engine-engine tadi.

### Belum termasuk di Fase 2 ini (kandidat Fase 3):
- Kirim notifikasi email/WhatsApp otomatis ke PIC (bisa reuse pola EmailJS
  seperti di Dev PM Bapak — tinggal sambungkan `followup-engine.js` ke EmailJS)
- Ringkasan naratif harian dari AI (Claude API) — sebaiknya lewat Firebase
  Cloud Function, bukan langsung dari browser, supaya API key tidak
  terekspos ke publik
- Cek ketersediaan bahan di gudang (butuh sumber data gudang yang belum
  Bapak sebutkan — sheet terpisah? sistem lain?)
- Scoring ide-ide sample baru (butuh kriteria penilaian dari Bapak dulu)

Kabari saya kalau mau lanjut ke salah satu di atas, atau kalau setelah
dicoba ada bagian yang errornya perlu diperbaiki.
