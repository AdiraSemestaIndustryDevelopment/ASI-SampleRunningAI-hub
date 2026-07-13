// ============================================================
// PROCESS-LOG-ENGINE.JS — menyambungkan data WIP utama ke log
// kerja tiap spesialis (Artwork, Mutoh, Pattern, 3D, M4), supaya
// follow-up & prediksi berbasis DATA NYATA, bukan tebakan kata kunci.
//
// Cara kerja:
// 1. Muat semua collection log dari Firestore (real-time).
// 2. Untuk 1 item WIP, cari baris log yang match:
//    - Prioritas 1: match by No SMI (_smi_ref) -> PASTI benar.
//    - Fallback (khusus M4, karena sheet-nya tidak punya kolom SMI):
//      match by nama Style (_style_ref_normalized) -> KEMUNGKINAN
//      BESAR benar, tapi bisa salah kalau ada beberapa SMI dengan
//      nama style yang sama persis (repeat order). Ditandai jelas
//      di UI sebagai "match by style" supaya user tahu tingkat
//      kepercayaannya beda.
// ============================================================
 
import { db } from "./firebase-config.js";
import { collection, getDocs } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
 
// PENTING soal kuota Firestore: collection log (Artwork/Mutoh/Pattern/dst)
// jumlahnya bisa ribuan dokumen. Data ini SENGAJA cuma dimuat SEKALI saat
// dashboard dibuka -- BUKAN auto-refresh berkala -- supaya tidak boros
// kuota baca harian (Firebase Spark gratis cuma 50rb baca/hari).
// Untuk data terbaru, panggil refreshProcessLogs() manual (misal lewat
// tombol "Refresh" di dashboard).
 
const PROCESS_DEFS = [
  { key: "artwork", collection: "artwork_log", pic: "Tendi", label: "Artwork", finishField: "finish_artwork", targetField: "target_artwork" },
  { key: "mutoh", collection: "mutoh_log", pic: "Yogie", label: "Mutoh (Digital Print)", finishField: "tgl_finish_ok_auto", targetField: "tgl_target_auto" },
  { key: "pattern_ase", collection: "pattern_ase_log", pic: "Ase", label: "Pattern (Ase)", finishField: "finish_pattern_diserahkan_ke_sample_auto", targetField: "target_auto" },
  { key: "pattern_reza", collection: "pattern_reza_log", pic: "Reza", label: "Pattern (Reza)", finishField: "finish_pattern_diserahkan_ke_sample_auto", targetField: "target_auto" },
  { key: "3d", collection: "log_3d", pic: "Adhi", label: "3D Design", finishField: "finish", targetField: "target_tgl_kirim_3d_h_1" },
  { key: "m4", collection: "m4_log", pic: "Rachmat", label: "M4 (IHP)", finishField: "tanggal_terima", targetField: "target_terima", matchBy: "style" },
  { key: "material_leather", collection: "material_leather_log", label: "Material Leather", finishField: "actual_terima", targetField: "planning_terima", dynamicPicFromTeam: true, fulfillerLabel: "Tanery (Calvin / Andre)" },
  { key: "material_non_leather", collection: "material_non_leather_log", label: "Material Non-Leather", finishField: "actual_terima", targetField: "planning_terima", dynamicPicFromTeam: true, fulfillerLabel: "Sourcing (Dian / Irenne)" },
  { key: "sample_approved", collection: "sample_approved_log", label: "Duplicate Sample (Approved)", finishField: "tgl_finish_duplicate_sample", targetField: "target_kirim_draft_sample", matchBy: "style", dynamicPicFromTeam: true }
];
 
// Fallback lokal (duplikat kecil dari followup-engine, sengaja tidak di-import
// supaya tidak ada circular dependency antar file).
const LOCAL_TEAM_PIC_MAP = { kopo: "Wiji", katapang: "Vanny" };
function resolvePicFromRowTeam(row) {
  const normalized = String(row.team || "").trim().toLowerCase();
  if (normalized.includes("kopo")) return LOCAL_TEAM_PIC_MAP.kopo;
  if (normalized.includes("katapang")) return LOCAL_TEAM_PIC_MAP.katapang;
  return "Vanny & Wiji";
}
 
let cachedLogs = {}; // { artwork_log: [...], mutoh_log: [...], ... }
const REFRESH_INTERVAL_MS = 15 * 60 * 1000; // 15 menit -- hemat kuota, bukan real-time
let refreshTimer = null;
 
/**
 * Mulai muat semua collection log, lalu auto-refresh tiap 15 menit.
 * Panggil sekali di awal (misal saat dashboard load).
 */
async function loadAllLogCollectionsOnce(onUpdateCallback) {
  const allCollections = [...PROCESS_DEFS.map(d => d.collection), TRIAL_LOG_COLLECTION, PLAYER_TESTING_COLLECTION];
  await Promise.all(allCollections.map(async (collectionName) => {
    try {
      const snapshot = await getDocs(collection(db, collectionName));
      cachedLogs[collectionName] = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
    } catch (err) {
      console.error(`Gagal load ${collectionName}:`, err.message);
      cachedLogs[collectionName] = cachedLogs[collectionName] || [];
    }
  }));
  onUpdateCallback();
}
 
function startProcessLogListeners(onUpdateCallback) {
  loadAllLogCollectionsOnce(onUpdateCallback);
  if (refreshTimer) clearInterval(refreshTimer);
  refreshTimer = setInterval(() => loadAllLogCollectionsOnce(onUpdateCallback), REFRESH_INTERVAL_MS);
}
 
/**
 * Panggil manual (misal dari tombol "Refresh") untuk ambil data terbaru
 * di luar jadwal otomatis 15 menit.
 */
function refreshProcessLogs(onUpdateCallback) {
  return loadAllLogCollectionsOnce(onUpdateCallback);
}
 
function stopProcessLogListeners() {
  if (refreshTimer) clearInterval(refreshTimer);
  refreshTimer = null;
}
 
/**
 * Cari semua baris log yang berhubungan dengan 1 item WIP, untuk 1 jenis proses.
 * Return: { rows: [...], matchType: "smi" | "style" | "none" }
 */
function findRelatedLogRows(wipItem, def) {
  const rows = cachedLogs[def.collection] || [];
  const smiRef = String(wipItem.no_smi || "").trim();
  const styleRef = String(wipItem.style || "").trim().toLowerCase();
 
  if (def.matchBy !== "style" && smiRef) {
    const bySmiMatch = rows.filter(r => String(r._smi_ref || "").trim() === smiRef);
    if (bySmiMatch.length > 0) return { rows: bySmiMatch, matchType: "smi" };
  }
 
  // Fallback / khusus M4: match by style
  if (styleRef) {
    const byStyleMatch = rows.filter(r => String(r._style_ref_normalized || "").trim() === styleRef);
    if (byStyleMatch.length > 0) return { rows: byStyleMatch, matchType: "style" };
  }
 
  return { rows: [], matchType: "none" };
}
 
/**
 * Format value tanggal dari Firestore (bisa berupa Timestamp object atau string biasa)
 * jadi teks tanggal yang enak dibaca.
 */
function formatDateValue(val) {
  if (!val) return null;
  if (typeof val.toDate === "function") {
    return val.toDate().toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" });
  }
  return String(val);
}
 
/**
 * Cek apakah target date sudah lewat hari ini.
 */
function isTargetOverdue(val) {
  if (!val) return false;
  const date = typeof val.toDate === "function" ? val.toDate() : new Date(val);
  if (isNaN(date.getTime())) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  date.setHours(0, 0, 0, 0);
  return date < today;
}
 
/**
 * Untuk 1 item WIP, cek status di SEMUA proses (artwork, mutoh, pattern, 3d, m4).
 * Return array temuan: proses yang belum selesai, lengkap dengan PIC asli,
 * tingkat kepercayaan match, dan status overdue (sudah lewat target atau belum).
 */
function checkProcessStatusForItem(wipItem) {
  const findings = [];
 
  PROCESS_DEFS.forEach(def => {
    const { rows, matchType } = findRelatedLogRows(wipItem, def);
    if (rows.length === 0) return;
 
    const unfinished = rows.filter(r => {
      const finishVal = r[def.finishField];
      return !finishVal || String(finishVal).trim() === "";
    });
 
    if (unfinished.length > 0) {
      const targetRaw = unfinished[0][def.targetField] || null;
      const pic = def.dynamicPicFromTeam ? resolvePicFromRowTeam(unfinished[0]) : def.pic;
      findings.push({
        process: def.label,
        pic,
        fulfillerLabel: def.fulfillerLabel || null,
        matchType,
        unfinishedCount: unfinished.length,
        totalRows: rows.length,
        sampleTarget: formatDateValue(targetRaw),
        isOverdue: isTargetOverdue(targetRaw),
        sampleNote: unfinished[0].note || unfinished[0].noted || null
      });
    }
  });
 
  return findings;
}
 
const TRIAL_LOG_COLLECTION = "trial_log";
const PLAYER_TESTING_COLLECTION = "player_testing_log";
 
/**
 * Analisis riwayat trial untuk 1 item WIP -- kalau sudah trial berkali-kali,
 * itu sinyal ada masalah desain/pattern yang berulang, bukan cuma kelamaan biasa.
 * Berbeda dari PROCESS_DEFS (yang cek "belum selesai"), ini cek "seberapa
 * sering diulang" -- trial_log murni catatan riwayat, bukan tugas dengan deadline.
 */
function checkTrialHistory(wipItem, threshold = 3) {
  const rows = cachedLogs[TRIAL_LOG_COLLECTION] || [];
  const smiRef = String(wipItem.no_smi || "").trim();
  if (!smiRef) return null;
 
  const trials = rows.filter(r => String(r._smi_ref || "").trim() === smiRef);
  if (trials.length < threshold) return null;
 
  // Urutkan berdasarkan "trial_ke" kalau ada, ambil catatan trial terakhir
  const sorted = [...trials].sort((a, b) => (Number(a.trial_ke) || 0) - (Number(b.trial_ke) || 0));
  const latest = sorted[sorted.length - 1];
 
  return {
    trialCount: trials.length,
    latestNote: latest.note_trial || latest.note || null,
    pic: "Ase / Reza (Pattern)"
  };
}
 
/**
 * Cek riwayat player testing untuk 1 style -- kalau ada hasil NOK,
 * itu sinyal kualitas yang perlu diwaspadai (dari catatan asli, bukan tebakan).
 * Match by nama Style saja (sheet ini tidak ada kolom No SMI).
 */
function checkPlayerTestingFeedback(wipItem) {
  const rows = cachedLogs[PLAYER_TESTING_COLLECTION] || [];
  const styleRef = String(wipItem.style || "").trim().toLowerCase();
  if (!styleRef) return null;
 
  const matches = rows.filter(r => String(r._style_ref_normalized || "").trim() === styleRef);
  if (matches.length === 0) return null;
 
  const nokMatches = matches.filter(r => String(r.hasil_ok_nok || "").toUpperCase().includes("NOK"));
  if (nokMatches.length === 0) return null;
 
  const latest = nokMatches[nokMatches.length - 1];
  return {
    nokCount: nokMatches.length,
    totalTests: matches.length,
    latestNote: latest.kesimpulan || latest.analisa_test || null,
    pic: "Arlita (rekap player testing)"
  };
}
 
export { startProcessLogListeners, refreshProcessLogs, stopProcessLogListeners, checkProcessStatusForItem, checkTrialHistory, checkPlayerTestingFeedback, findRelatedLogRows, formatDateValue, isTargetOverdue, PROCESS_DEFS };
 
