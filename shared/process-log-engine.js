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
import { collection, onSnapshot } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const PROCESS_DEFS = [
  { key: "artwork", collection: "artwork_log", pic: "Tendi", label: "Artwork", finishField: "finish_artwork", targetField: "target_artwork" },
  { key: "mutoh", collection: "mutoh_log", pic: "Yogie", label: "Mutoh (Digital Print)", finishField: "tgl_finish_ok_auto", targetField: "tgl_target_auto" },
  { key: "pattern_ase", collection: "pattern_ase_log", pic: "Ase", label: "Pattern (Ase)", finishField: "finish_pattern_diserahkan_ke_sample_auto", targetField: "target_auto" },
  { key: "pattern_reza", collection: "pattern_reza_log", pic: "Reza", label: "Pattern (Reza)", finishField: "finish_pattern_diserahkan_ke_sample_auto", targetField: "target_auto" },
  { key: "3d", collection: "log_3d", pic: "Adhi", label: "3D Design", finishField: "finish", targetField: "target_tgl_kirim_3d_h_1" },
  { key: "m4", collection: "m4_log", pic: "Rachmat", label: "M4 (IHP)", finishField: "tanggal_terima", targetField: "target_terima", matchBy: "style" },
  { key: "material_leather", collection: "material_leather_log", pic: "Lina (Material/Gudang)", label: "Material Leather", finishField: "actual_terima", targetField: "planning_terima" },
  { key: "material_non_leather", collection: "material_non_leather_log", pic: "Lina (Material/Gudang)", label: "Material Non-Leather", finishField: "actual_terima", targetField: "planning_terima" }
];

let cachedLogs = {}; // { artwork_log: [...], mutoh_log: [...], ... }
let listeners = [];

/**
 * Mulai dengerin semua collection log secara real-time.
 * Panggil sekali di awal (misal saat dashboard load).
 */
function startProcessLogListeners(onUpdateCallback) {
  const allCollections = [...PROCESS_DEFS.map(d => d.collection), TRIAL_LOG_COLLECTION];
  allCollections.forEach(collectionName => {
    const unsub = onSnapshot(collection(db, collectionName), (snapshot) => {
      cachedLogs[collectionName] = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      onUpdateCallback();
    }, (err) => {
      console.error(`Gagal load ${collectionName}:`, err.message);
      cachedLogs[collectionName] = cachedLogs[collectionName] || [];
    });
    listeners.push(unsub);
  });
}

function stopProcessLogListeners() {
  listeners.forEach(unsub => unsub());
  listeners = [];
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
      findings.push({
        process: def.label,
        pic: def.pic,
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

export { startProcessLogListeners, stopProcessLogListeners, checkProcessStatusForItem, checkTrialHistory, findRelatedLogRows, formatDateValue, isTargetOverdue, PROCESS_DEFS };
